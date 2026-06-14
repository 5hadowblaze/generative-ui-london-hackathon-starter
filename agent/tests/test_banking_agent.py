import json
import unittest
from unittest.mock import patch

from langchain_core.messages import HumanMessage, ToolMessage

from src import banking_agent


class BankingAgentTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(
            "os.environ",
            {
                "BANKING_DISABLE_GENERATIVE_UI": "1",
            },
            clear=False,
        )
        self.env.start()
        self.addCleanup(self.env.stop)

    def test_account_closure_prompt_gets_own_case_kind(self):
        self.assertEqual(
            banking_agent._case_kind("I want to close my account today"),
            "account_closure",
        )
        self.assertEqual(
            banking_agent._context_id("account_closure"),
            "rho-account-closure-demo",
        )

    def test_dispute_stage_changes_tool_status_and_next_action(self):
        intake = banking_agent._build_payload(
            "dispute",
            "I see a card charge I do not recognize",
            "rho-dispute-demo",
            case_stage="intake",
            live_a2a_enabled=False,
        )
        verified = banking_agent._build_payload(
            "dispute",
            "I see a card charge I do not recognize",
            "rho-dispute-demo",
            case_stage="verified",
            live_a2a_enabled=False,
        )
        completed = banking_agent._build_payload(
            "dispute",
            "I see a card charge I do not recognize",
            "rho-dispute-demo",
            case_stage="completed",
            live_a2a_enabled=False,
        )

        self.assertEqual(intake["summary"]["stage"], "intake")
        self.assertEqual(intake["tool"]["status"], "blocked")
        self.assertEqual(intake["nextAction"]["event"], "verify_identity")

        self.assertEqual(verified["summary"]["stage"], "verified")
        self.assertEqual(verified["tool"]["status"], "proposed")
        self.assertEqual(verified["nextAction"]["event"], "approve_tool_action")

        self.assertEqual(completed["summary"]["stage"], "completed")
        self.assertEqual(completed["tool"]["status"], "complete")
        self.assertEqual(completed["nextAction"]["event"], "export_audit_receipt")

    def test_payload_includes_gemini_health_and_case_receipt(self):
        with patch.dict(
            "os.environ",
            {
                "BANKING_DISABLE_GENERATIVE_UI": "1",
            },
            clear=False,
        ):
            payload = banking_agent._build_payload(
                "human_transfer",
                "I want a human agent",
                "rho-human-transfer-demo",
                case_stage="intake",
                live_a2a_enabled=False,
            )

        checks = {check["name"]: check for check in payload["summary"]["integrationChecks"]}
        self.assertIn("Gemini", checks)
        self.assertEqual(checks["Gemini"]["status"], "off")
        self.assertEqual(
            payload["receipt"]["requiredTechUsed"],
            "A2A handoff, Redis memory, LinkUp evidence, Gemini A2UI composer",
        )
        self.assertIn("continue CS-agent support", payload["receipt"]["nextSafeAction"])
        self.assertIn("Human transfer", payload["receipt"]["notPerformed"])

    def test_health_snapshot_uses_public_status_only(self):
        with patch.dict(
            "os.environ",
            {
                "BANKING_A2A_AGENT_URL": "http://localhost:9001",
                "REDIS_URL": "redis://localhost:6379/0",
                "LINKUP_API_KEY": "secret-linkup",
                "GEMINI_API_KEY": "secret-gemini",
                "BANKING_DISABLE_GENERATIVE_UI": "0",
            },
            clear=False,
        ):
            health = banking_agent.integration_health_snapshot(live_a2a_enabled=True)

        self.assertEqual([item["name"] for item in health], ["A2A", "Redis", "LinkUp", "Gemini"])
        self.assertTrue(all(set(item) == {"name", "status", "message"} for item in health))
        self.assertTrue(all("secret" not in item["message"] for item in health))

    def test_fixture_mode_reports_public_integration_statuses_without_secrets(self):
        payload = banking_agent._build_payload(
            "referral",
            "Refer Dana for a Blue Account",
            "rho-referral-demo",
            case_stage="intake",
            live_a2a_enabled=False,
        )

        statuses = {check["name"]: check["status"] for check in payload["summary"]["integrationChecks"]}

        self.assertEqual(statuses["A2A"], "off")
        self.assertEqual(statuses["Redis"], "off")
        self.assertEqual(statuses["LinkUp"], "off")
        self.assertEqual(statuses["Gemini"], "off")
        serialized = json.dumps(payload)
        self.assertNotIn("BANKING_A2A_AGENT_URL=", serialized)
        self.assertNotIn("REDIS_URL=", serialized)
        self.assertNotIn("LINKUP_API_KEY=", serialized)
        self.assertNotIn("GEMINI_API_KEY=", serialized)

    def test_live_mode_blocks_when_required_integrations_are_unavailable(self):
        payload = banking_agent._build_payload(
            "referral",
            "Refer Dana for a Blue Account",
            "rho-referral-demo",
            case_stage="intake",
            live_a2a_enabled=True,
        )

        statuses = {check["name"]: check["status"] for check in payload["summary"]["integrationChecks"]}

        self.assertEqual(statuses["A2A"], "blocked")
        self.assertEqual(statuses["Redis"], "blocked")
        self.assertEqual(statuses["LinkUp"], "blocked")
        self.assertEqual(statuses["Gemini"], "off")
        self.assertEqual(payload["tool"]["status"], "blocked")
        self.assertEqual(payload["summary"]["status"], "Required tech missing")

    def test_receipt_contains_case_specific_values(self):
        expectations = {
            "referral": {
                "required": "A2A handoff, Redis memory, LinkUp evidence, Gemini A2UI composer",
                "not_performed": "Referral submission was not executed; friend contact details and user approval are still required.",
            },
            "dispute": {
                "required": "A2A handoff, Redis memory, LinkUp evidence, Gemini A2UI composer",
                "not_performed": "No transaction lookup or dispute filing was performed before identity verification and explicit approval.",
            },
            "human_transfer": {
                "required": "A2A handoff, Redis memory, LinkUp evidence, Gemini A2UI composer",
                "not_performed": "Human transfer was not scheduled; policy requires the agent support path before escalation.",
                "next_safe_action": "continue CS-agent support before escalation",
            },
        }

        for kind, expected in expectations.items():
            with self.subTest(kind=kind):
                payload = banking_agent._build_payload(
                    kind,
                    "Please help with this banking request",
                    f"rho-{kind.replace('_', '-')}-demo",
                    case_stage="intake",
                    live_a2a_enabled=False,
                )
                receipt = payload["receipt"]

                self.assertEqual(receipt["requiredTechUsed"], expected["required"])
                self.assertEqual(receipt["toolStatus"], payload["tool"]["status"])
                self.assertEqual(
                    receipt["nextSafeAction"],
                    expected.get("next_safe_action", payload["nextAction"]["label"]),
                )
                self.assertEqual(receipt["notPerformed"], expected["not_performed"])

    def test_live_a2a_success_uses_handoff_and_full_response_labels(self):
        with patch.dict(
            "os.environ",
            {
                "BANKING_A2A_AGENT_URL": "http://a2a.test",
                "REDIS_URL": "redis://localhost:6379/0",
                "LINKUP_API_KEY": "linkup-secret",
                "GEMINI_API_KEY": "gemini-secret",
                "BANKING_DISABLE_GENERATIVE_UI": "0",
            },
            clear=False,
        ), patch(
            "src.banking_agent._call_a2a",
            return_value={
                "ok": True,
                "endpoint": "http://a2a.test",
                "note": "A2A ok",
                "text": "A2A artifact text only",
            },
        ), patch(
            "src.banking_agent._linkup_sources",
            return_value=(
                [{"id": "linkup-1", "title": "Source", "source": "LinkUp", "excerpt": "Public"}],
                {"name": "LinkUp", "ok": True, "status": "live", "message": "LinkUp returned one result."},
            ),
        ), patch(
            "src.banking_agent._redis_source",
            return_value=(
                {"id": "redis-state", "title": "Case memory", "source": "Redis", "excerpt": "Redis persisted state."},
                {"name": "Redis", "ok": True, "status": "live", "message": "Redis persisted state."},
            ),
        ), patch("src.banking_agent._start_full_a2a_transcript_job"), patch(
            "src.banking_agent._store_redis"
        ):
            payload = banking_agent._build_payload(
                "referral",
                "Refer Dana for a Blue Account",
                "rho-referral-demo",
                case_stage="intake",
                live_a2a_enabled=True,
            )

        statuses = {check["name"]: check["status"] for check in payload["summary"]["integrationChecks"]}
        edge_labels = {edge["label"] for edge in payload["relay"]["edges"]}
        source_titles = {source["title"] for source in payload["policy"]["sources"]}

        self.assertEqual(statuses["A2A"], "live")
        self.assertEqual(statuses["Redis"], "live")
        self.assertEqual(statuses["LinkUp"], "live")
        self.assertEqual(statuses["Gemini"], "live")
        self.assertIn("Live A2A handoff", edge_labels)
        self.assertIn("Full A2A response", source_titles)

    def test_fallback_components_include_stage_cta_and_case_specific_table(self):
        payload = banking_agent._build_payload(
            "account_closure",
            "I want to close my account",
            "rho-account-closure-demo",
            case_stage="intake",
            live_a2a_enabled=False,
        )

        components = banking_agent._components(payload)
        by_id = {component["id"]: component for component in components}

        self.assertEqual(by_id["case-table"]["component"], "DataTable")
        self.assertEqual(by_id["next-action"]["component"], "Button")
        self.assertEqual(
            by_id["next-action"]["action"]["event"]["name"],
            payload["nextAction"]["event"],
        )

    def test_generate_case_surface_falls_back_to_deterministic_components(self):
        payload = banking_agent._build_payload(
            "referral",
            "Refer Dana for a Blue Account",
            "rho-referral-demo",
            case_stage="intake",
            live_a2a_enabled=False,
        )

        components, data = banking_agent.generate_case_surface(payload)

        self.assertTrue(any(component["id"] == "root" for component in components))
        self.assertEqual(data["case"]["summary"]["intent"], payload["summary"]["intent"])

    def test_case_render_model_uses_vertex_backend_configuration(self):
        captured = {}

        def fake_model(**kwargs):
            captured.update(kwargs)
            return object()

        original_model = banking_agent._CASE_RENDER_MODEL
        banking_agent._CASE_RENDER_MODEL = None
        self.addCleanup(setattr, banking_agent, "_CASE_RENDER_MODEL", original_model)

        with patch.dict(
            "os.environ",
            {
                "GOOGLE_API_KEY": "google-secret",
                "GEMINI_API_KEY": "gemini-secret",
                "GOOGLE_GENAI_USE_VERTEXAI": "true",
                "GOOGLE_CLOUD_PROJECT": "rho-project",
                "GOOGLE_CLOUD_LOCATION": "global",
            },
            clear=False,
        ), patch("src.banking_agent.ChatGoogleGenerativeAI", side_effect=fake_model):
            banking_agent._case_render_model()

        self.assertNotIn("google_api_key", captured)
        self.assertEqual(captured["api_key"], "google-secret")
        self.assertTrue(captured["vertexai"])
        self.assertEqual(captured["project"], "rho-project")
        self.assertEqual(captured["location"], "global")

    def test_generated_component_type_alias_is_normalized(self):
        components = [
            {
                "id": "root",
                "type": "Stack",
                "props": {"children": ["title"]},
            },
            {
                "id": "title",
                "type": "Heading",
                "props": {"text": "Dispute intake", "level": "2"},
            },
        ]

        normalized = banking_agent._normalize_component_tree(components)

        self.assertTrue(banking_agent._valid_component_tree(normalized))
        self.assertEqual(normalized[0]["component"], "Stack")
        self.assertEqual(normalized[1]["component"], "Heading")

    def test_send_a2a_message_uses_passed_message_text(self):
        captured = {}

        class FakeResponse:
            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return None

            def read(self):
                return json.dumps(
                    {"result": {"parts": [{"kind": "text", "text": "ok"}]}}
                ).encode()

        def fake_urlopen(request, timeout):
            captured["payload"] = json.loads(request.data.decode())
            captured["timeout"] = timeout
            return FakeResponse()

        with patch("urllib.request.urlopen", side_effect=fake_urlopen):
            result = banking_agent._send_a2a_message(
                "http://example.test",
                "hello over a2a",
                "ctx-1",
                1.5,
            )

        self.assertTrue(result["ok"])
        message = captured["payload"]["params"]["message"]
        self.assertEqual(message["parts"][0]["text"], "hello over a2a")
        self.assertEqual(message["contextId"], "ctx-1")
        self.assertEqual(captured["timeout"], 1.5)

    def test_offscript_prompt_renders_unknown_safe_room(self):
        payload = banking_agent._build_payload(
            "unknown",
            "I lost my card abroad and need emergency cash",
            "rho-unknown-demo",
            case_stage="intake",
            live_a2a_enabled=False,
        )

        self.assertEqual(payload["summary"]["caseKind"], "unknown")
        self.assertEqual(payload["tool"]["toolName"], "route_request")
        self.assertEqual(payload["tool"]["riskLevel"], "low")
        self.assertEqual(payload["nextAction"]["event"], "clarify_request")
        self.assertIn("how i can help", payload["outcome"]["title"].lower())

        components = banking_agent._components(payload)
        self.assertTrue(banking_agent._valid_component_tree(components))

    def test_reasoning_threads_provenance_and_extracted_fields(self):
        reasoning = {
            "case_kind": "referral",
            "confidence": "high",
            "policy_rationale": "Referral stays user-side; collect real details first.",
            "next_action": "Collect Dana's contact details and ask for approval.",
            "extracted_fields": {"friend_name": "Dana"},
            "source": "llm",
        }
        payload = banking_agent._build_payload(
            "referral",
            "Refer my friend Dana",
            "rho-referral-demo",
            case_stage="intake",
            live_a2a_enabled=False,
            reasoning=reasoning,
        )

        self.assertEqual(payload["summary"]["reasonedBy"], "Gemini")
        self.assertEqual(payload["summary"]["confidence"], "high")
        self.assertEqual(payload["receipt"]["reasonedBy"], "Gemini")
        self.assertEqual(payload["nextAction"]["caption"], reasoning["next_action"])
        friend_arg = next(
            arg for arg in payload["tool"]["arguments"] if arg["key"] == "friend_name"
        )
        self.assertEqual(friend_arg["value"], "Dana")
        source_ids = {source["id"] for source in payload["policy"]["sources"]}
        self.assertIn("gemini-rationale", source_ids)

    def test_fallback_reasoning_marks_provenance_as_fallback(self):
        reasoning = {
            "case_kind": "dispute",
            "confidence": "medium",
            "policy_rationale": "Disputes are verification-first.",
            "next_action": "Confirm two factors.",
            "extracted_fields": {},
            "source": "fallback",
        }
        payload = banking_agent._build_payload(
            "dispute",
            "I see a charge I do not recognize",
            "rho-dispute-demo",
            case_stage="intake",
            live_a2a_enabled=False,
            reasoning=reasoning,
        )
        self.assertEqual(payload["summary"]["reasonedBy"], "fallback")
        source_ids = {source["id"] for source in payload["policy"]["sources"]}
        self.assertNotIn("gemini-rationale", source_ids)

    def test_generate_threads_reasoning_json_into_tool_call(self):
        model = banking_agent.BankingCaseModel()
        result = model._generate(
            [HumanMessage(content="I want to refer my friend Dana for a Blue Account")]
        )
        call = result.generations[0].message.tool_calls[0]
        self.assertEqual(call["name"], banking_agent.TOOL_NAME)
        self.assertIn("reasoning_json", call["args"])
        self.assertEqual(call["args"]["case_kind"], "referral")
        reasoning = json.loads(call["args"]["reasoning_json"])
        self.assertEqual(reasoning["source"], "fallback")
        self.assertEqual(reasoning["case_kind"], "referral")

    def test_action_tool_message_regenerates_case_room(self):
        model = banking_agent.BankingCaseModel()
        result = model._generate(
            [
                HumanMessage(
                    content="I see a card charge I do not recognize. Can you help me dispute it?"
                ),
                HumanMessage(content="Verify Identity"),
                ToolMessage(
                    content='User performed action "verify_identity" on surface "rho-case-room".',
                    tool_call_id="action-1",
                    name="log_a2ui_event",
                ),
            ]
        )

        message = result.generations[0].message

        self.assertEqual(message.tool_calls[0]["name"], banking_agent.TOOL_NAME)
        self.assertEqual(message.tool_calls[0]["args"]["case_kind"], "dispute")
        self.assertEqual(message.tool_calls[0]["args"]["case_stage"], "verified")


if __name__ == "__main__":
    unittest.main()
