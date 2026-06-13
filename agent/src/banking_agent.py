"""Banking case-room agent for Rho Signal Room.

This endpoint uses strict integration readiness in Live A2A mode: it renders a
blocked readiness surface if required hackathon integrations are missing,
instead of silently substituting fake evidence. When the user switches Live A2A
off, the UI is in explicit fixture mode for comparison only.

- LINKUP_API_KEY -> live public source snippets in PolicyRadar.
- REDIS_URL -> persisted case state by context id.
- BANKING_A2A_AGENT_URL -> live A2A call to a banking personal agent.
"""
from __future__ import annotations

import json
import os
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from typing import Any, Literal, Sequence, TypedDict

from copilotkit import CopilotKitMiddleware, a2ui
from langchain.agents import create_agent
from langchain.tools import ToolRuntime, tool
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from langchain_core.tools import tool as lc_tool
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.checkpoint.memory import MemorySaver

from src.catalog import CATALOG_ID, CATALOG_PROMPT

SURFACE = "rho-case-room"
TOOL_NAME = "render_case_room"
DEFAULT_A2A_TIMEOUT_SECONDS = 30.0
DEFAULT_FULL_A2A_TIMEOUT_SECONDS = 180.0
DEFAULT_LINKUP_TIMEOUT_SECONDS = 10.0

CaseKind = Literal["referral", "dispute", "human_transfer", "account_closure"]
CaseStage = Literal["intake", "verified", "approved", "completed"]


class CaseArgs(TypedDict):
    case_kind: CaseKind
    case_stage: CaseStage
    user_request: str
    context_id: str


class A2AEnrichment(TypedDict):
    ok: bool
    endpoint: str
    note: str
    text: str


class IntegrationCheck(TypedDict):
    name: str
    ok: bool
    status: Literal["live", "off", "blocked"]
    message: str


def _text_of(message: BaseMessage) -> str:
    content = message.content
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, dict) and isinstance(item.get("text"), str):
                parts.append(item["text"])
            else:
                parts.append(str(item))
        return " ".join(parts)
    return str(content)


def _latest_user_text(messages: Sequence[BaseMessage]) -> str:
    for message in reversed(messages):
        if message.type in {"human", "user"}:
            text = _text_of(message).strip()
            if text:
                return text
    return "I want to refer my friend Dana for a Blue Account."


def _latest_case_request(messages: Sequence[BaseMessage]) -> str:
    for message in reversed(messages):
        if message.type not in {"human", "user"}:
            continue
        text = _text_of(message).strip()
        if text and not _is_surface_action_text(text):
            return text
    return _latest_user_text(messages)


def _is_surface_action_text(text: str) -> bool:
    lower = text.lower()
    return any(
        phrase in lower
        for phrase in [
            "verify identity",
            "confirm verified factors",
            "approve tool action",
            "approve dispute filing",
            "complete case",
            "export audit receipt",
            "export receipt",
        ]
    )


def _case_kind(text: str) -> CaseKind:
    lower = text.lower()
    if any(
        phrase in lower
        for phrase in ["close account", "account closure", "close my account", "close the account"]
    ):
        return "account_closure"
    if any(word in lower for word in ["dispute", "charge", "transaction", "fraud"]):
        return "dispute"
    if any(word in lower for word in ["human", "representative", "agent now", "manager"]):
        return "human_transfer"
    return "referral"


def _context_id(kind: CaseKind) -> str:
    return f"rho-{kind.replace('_', '-')}-demo"


def _status_for(kind: CaseKind) -> tuple[str, str, str]:
    if kind == "dispute":
        return ("Dispute intake", "Verification required", "CS agent")
    if kind == "account_closure":
        return ("Account closure", "Dependency review", "CS agent")
    if kind == "human_transfer":
        return ("Human transfer boundary", "Policy review", "CS agent")
    return ("Referral", "Ready for user action", "Personal agent")


def _case_stage(messages: Sequence[BaseMessage]) -> CaseStage:
    latest = _latest_user_text(messages).lower()
    if any(phrase in latest for phrase in ["export audit receipt", "export receipt"]):
        return "completed"
    if "complete case" in latest:
        return "completed"
    if any(phrase in latest for phrase in ["approve tool action", "approve dispute filing"]):
        return "approved"
    if any(phrase in latest for phrase in ["verify identity", "confirm verified factors"]):
        return "verified"
    return "intake"


def _policy_sources(
    kind: CaseKind,
    linkup_sources: list[dict[str, str]],
    redis_source: dict[str, str] | None,
    checks: list[IntegrationCheck],
) -> list[dict[str, str]]:
    base = {
        "referral": [
            {
                "id": "kb-referral",
                "title": "Referral procedure",
                "source": "Rho-Bank KB",
                "excerpt": "Customer service verifies the policy path, then the user-side assistant submits referral details through the user discoverable referral tool.",
            },
            {
                "id": "kb-blue-account",
                "title": "Blue Account eligibility",
                "source": "Rho-Bank KB",
                "excerpt": "Referral actions need real customer-provided values. The assistant must not invent friend details or placeholder account data.",
            },
        ],
        "dispute": [
            {
                "id": "kb-dispute",
                "title": "Card dispute intake",
                "source": "Rho-Bank KB",
                "excerpt": "Customer-specific transaction discussion requires identity verification before account lookup or dispute filing.",
            },
            {
                "id": "kb-verification",
                "title": "Identity verification gate",
                "source": "Rho-Bank policy",
                "excerpt": "Two verified factors are required before revealing private data or mutating the customer account.",
            },
        ],
        "account_closure": [
            {
                "id": "kb-closure",
                "title": "Account closure dependencies",
                "source": "Rho-Bank policy",
                "excerpt": "Account closure requires zero balance, no pending transfers, no unresolved disputes, and removal of linked cards or authorized users.",
            },
            {
                "id": "kb-closure-verification",
                "title": "Closure identity gate",
                "source": "Rho-Bank KB",
                "excerpt": "A customer must pass verification before the bank can disclose account blockers or start a closure request.",
            },
        ],
        "human_transfer": [
            {
                "id": "kb-transfer",
                "title": "Human transfer policy",
                "source": "Rho-Bank policy",
                "excerpt": "If the issue is within agent capability, the agent should try to help first. Repeated requests or unresolved blockers can trigger transfer.",
            },
            {
                "id": "kb-capability",
                "title": "Capability-first support",
                "source": "Rho-Bank KB",
                "excerpt": "Transfer is a fallback, not the first action, unless scenario-specific instructions require immediate escalation.",
            },
        ],
    }[kind]
    if redis_source:
        base.append(redis_source)
    for check in checks:
        if check["ok"]:
            continue
        base.append(
            {
                "id": f"integration-required-{check['name'].lower()}",
                "title": f"{check['name']} required",
                "source": "Integration readiness",
                "excerpt": check["message"],
            }
        )
    return [*base, *linkup_sources[:2]]


def _linkup_sources(kind: CaseKind) -> tuple[list[dict[str, str]], IntegrationCheck]:
    api_key = os.getenv("LINKUP_API_KEY")
    if not api_key:
        return [], {
            "name": "LinkUp",
            "ok": False,
            "status": "off",
            "message": "LINKUP_API_KEY is missing, so no live public-source evidence was fetched. Set the key server-side before judging.",
        }
    query = {
        "referral": "public explanation of bank account referral programs consumer banking",
        "dispute": "public explanation of debit card charge dispute process consumer banking",
        "account_closure": "public explanation of bank account closure process consumer banking",
        "human_transfer": "public customer support escalation best practices financial services",
    }[kind]
    payload = json.dumps(
        {
            "q": query,
            "depth": "fast",
            "outputType": "searchResults",
            "maxResults": 2,
        }
    ).encode()
    request = urllib.request.Request(
        "https://api.linkup.so/v1/search",
        data=payload,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    timeout_seconds = float(os.getenv("LINKUP_TIMEOUT_SECONDS", DEFAULT_LINKUP_TIMEOUT_SECONDS))
    try:
        with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
            data = json.loads(response.read().decode())
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode(errors="replace")[:220]
        return [], {
            "name": "LinkUp",
            "ok": False,
            "status": "blocked",
            "message": f"LinkUp live public search failed with HTTP {exc.code}: {detail or exc.reason}.",
        }
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError) as exc:
        reason = getattr(exc, "reason", None)
        detail = f": {reason}" if reason else ""
        return [], {
            "name": "LinkUp",
            "ok": False,
            "status": "blocked",
            "message": f"LinkUp live public search failed with {type(exc).__name__}{detail}; the app did not substitute fake public evidence.",
        }
    out = []
    for index, result in enumerate(data.get("results", [])[:2], 1):
        out.append(
            {
                "id": f"linkup-{index}",
                "title": str(result.get("name") or result.get("title") or "Public source"),
                "source": "LinkUp",
                "excerpt": str(result.get("content") or result.get("snippet") or "")[:220],
                "url": str(result.get("url") or ""),
            }
        )
    if not out:
        return [], {
            "name": "LinkUp",
            "ok": False,
            "status": "blocked",
            "message": "LinkUp responded but returned no public evidence results for this case.",
        }
    return out, {
        "name": "LinkUp",
        "ok": True,
        "status": "live",
        "message": f"LinkUp returned {len(out)} live public evidence source(s).",
    }


def _redis_source(context_id: str) -> tuple[dict[str, str] | None, IntegrationCheck]:
    redis_url = os.getenv("REDIS_URL")
    if not redis_url:
        return None, {
            "name": "Redis",
            "ok": False,
            "status": "off",
            "message": "REDIS_URL is missing, so case state was not persisted to Redis.",
        }
    try:
        import redis

        client = redis.Redis.from_url(redis_url, socket_connect_timeout=0.4, socket_timeout=0.4)
        previous = client.get(f"case:{context_id}:summary")
        if previous:
            excerpt = f"Redis rehydration found an existing case summary, then refreshed case:{context_id}:* for this turn."
        else:
            excerpt = f"Redis is enabled; this turn will persist summary, relay events, tool calls, policy evidence, and A2UI state under case:{context_id}:*."
        return {
            "id": "redis-state",
            "title": "Case memory",
            "source": "Redis",
            "excerpt": excerpt,
        }, {
            "name": "Redis",
            "ok": True,
            "status": "live",
            "message": excerpt,
        }
    except Exception as exc:  # noqa: BLE001 - demo should keep rendering.
        return None, {
            "name": "Redis",
            "ok": False,
            "status": "blocked",
            "message": f"Redis connection failed with {type(exc).__name__}; the app did not claim persisted case memory.",
        }


def _store_redis(context_id: str, payload: dict[str, Any]) -> None:
    redis_url = os.getenv("REDIS_URL")
    if not redis_url:
        return
    try:
        import redis

        client = redis.Redis.from_url(redis_url, socket_connect_timeout=0.4, socket_timeout=0.4)
        client.setex(f"case:{context_id}:summary", 3600, json.dumps(payload["summary"]))
        client.setex(f"case:{context_id}:agent_events", 3600, json.dumps(payload["relay"]["edges"]))
        client.setex(f"case:{context_id}:tool_calls", 3600, json.dumps(payload["tool"]))
        client.setex(f"case:{context_id}:policy_evidence", 3600, json.dumps(payload["policy"]["sources"]))
        client.setex(f"case:{context_id}:a2ui_state", 3600, json.dumps(payload))
    except Exception as exc:  # noqa: BLE001 - demo should keep rendering.
        payload["summary"]["redisError"] = f"{type(exc).__name__}: {exc}"


def _redis_client():
    redis_url = os.getenv("REDIS_URL")
    if not redis_url:
        return None
    try:
        import redis

        return redis.Redis.from_url(redis_url, socket_connect_timeout=0.4, socket_timeout=0.4)
    except Exception:  # noqa: BLE001 - readiness surfaces handle Redis separately.
        return None


def _full_a2a_key(context_id: str) -> str:
    return f"case:{context_id}:full_a2a_transcript"


def _write_full_a2a_status(context_id: str, payload: dict[str, Any]) -> None:
    client = _redis_client()
    if client is None:
        return
    client.setex(_full_a2a_key(context_id), 3600, json.dumps(payload))


def get_full_a2a_status(context_id: str) -> dict[str, Any]:
    client = _redis_client()
    if client is None:
        return {
            "status": "unavailable",
            "contextId": context_id,
            "message": "Redis is unavailable, so full A2A transcript polling is disabled.",
        }
    raw = client.get(_full_a2a_key(context_id))
    if not raw:
        return {
            "status": "missing",
            "contextId": context_id,
            "message": "No full A2A transcript job has been started for this case yet.",
        }
    try:
        value = json.loads(raw.decode() if isinstance(raw, bytes) else raw)
    except json.JSONDecodeError:
        return {
            "status": "failed",
            "contextId": context_id,
            "message": "Stored full A2A transcript state was not valid JSON.",
        }
    if isinstance(value, dict):
        return value
    return {
        "status": "failed",
        "contextId": context_id,
        "message": "Stored full A2A transcript state had an unexpected shape.",
    }


def _a2a_check(
    *,
    live_a2a_enabled: bool,
    a2a_url: str | None,
    a2a: A2AEnrichment | None,
) -> IntegrationCheck:
    if not live_a2a_enabled:
        return {
            "name": "A2A",
            "ok": False,
            "status": "off",
            "message": "Live A2A is switched off, so this run is not using the A2A banking personal agent.",
        }
    if not a2a_url:
        return {
            "name": "A2A",
            "ok": False,
            "status": "blocked",
            "message": "BANKING_A2A_AGENT_URL is missing, so no live A2A message/send call was made.",
        }
    if not a2a or not a2a["ok"]:
        return {
            "name": "A2A",
            "ok": False,
            "status": "blocked",
            "message": a2a["note"] if a2a else "The A2A banking personal agent did not return a successful response.",
        }
    return {
        "name": "A2A",
        "ok": True,
        "status": "live",
        "message": a2a["note"],
    }


def _extract_a2a_text(value: Any) -> str:
    """Best-effort extraction from A2A Message or Task JSON results."""
    if isinstance(value, str):
        return value
    if not isinstance(value, dict):
        return ""

    texts: list[str] = []
    for part in value.get("parts") or []:
        root = part.get("root") if isinstance(part, dict) else None
        source = root if isinstance(root, dict) else part
        if isinstance(source, dict) and isinstance(source.get("text"), str):
            texts.append(source["text"])

    status = value.get("status")
    if isinstance(status, dict):
        message = status.get("message")
        if isinstance(message, dict):
            text = _extract_a2a_text(message)
            if text:
                texts.append(text)

    for artifact in value.get("artifacts") or []:
        if not isinstance(artifact, dict):
            continue
        for part in artifact.get("parts") or []:
            root = part.get("root") if isinstance(part, dict) else None
            source = root if isinstance(root, dict) else part
            if isinstance(source, dict) and isinstance(source.get("text"), str):
                texts.append(source["text"])

    return "\n".join(texts)


def _discover_a2a_endpoint(base_url: str) -> str:
    base = base_url.rstrip("/")
    for path in (".well-known/agent.json", ".well-known/agent-card.json"):
        try:
            with urllib.request.urlopen(f"{base}/{path}", timeout=2) as response:
                card = json.loads(response.read().decode())
            card_url = card.get("url")
            if isinstance(card_url, str) and card_url:
                return _normalize_advertised_a2a_url(card_url, base)
        except Exception:  # noqa: BLE001 - fall through to direct endpoint.
            continue
    return base


def _normalize_advertised_a2a_url(card_url: str, configured_url: str) -> str:
    advertised = urllib.parse.urlparse(card_url)
    configured = urllib.parse.urlparse(configured_url)
    if advertised.hostname not in {"0.0.0.0", "::", "[::]"}:
        return card_url
    if not configured.hostname:
        return card_url

    netloc = configured.hostname
    if advertised.port:
        netloc = f"{netloc}:{advertised.port}"
    elif configured.port:
        netloc = f"{netloc}:{configured.port}"
    return urllib.parse.urlunparse(
        (
            advertised.scheme or configured.scheme or "http",
            netloc,
            advertised.path or configured.path or "",
            advertised.params,
            advertised.query,
            advertised.fragment,
        )
    )


def _call_a2a(url: str, message: str, context_id: str) -> A2AEnrichment:
    endpoint = _discover_a2a_endpoint(url)
    timeout_seconds = float(os.getenv("BANKING_A2A_TIMEOUT_SECONDS", DEFAULT_A2A_TIMEOUT_SECONDS))
    a2a_message = _a2a_probe_message(message)
    return _send_a2a_message(endpoint, a2a_message, context_id, timeout_seconds)


def _call_full_a2a(url: str, message: str, context_id: str) -> A2AEnrichment:
    endpoint = _discover_a2a_endpoint(url)
    timeout_seconds = float(
        os.getenv("BANKING_A2A_FULL_TIMEOUT_SECONDS", DEFAULT_FULL_A2A_TIMEOUT_SECONDS)
    )
    return _send_a2a_message(endpoint, message, context_id, timeout_seconds)


def _send_a2a_message(
    endpoint: str,
    message: str,
    context_id: str,
    timeout_seconds: float,
) -> A2AEnrichment:
    payload = {
        "jsonrpc": "2.0",
        "id": uuid.uuid4().hex,
        "method": "message/send",
        "params": {
            "message": {
                "kind": "message",
                "messageId": uuid.uuid4().hex,
                "role": "user",
                "contextId": context_id,
                "parts": [{"kind": "text", "text": message}],
            }
        },
    }
    request = urllib.request.Request(
        endpoint,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
            data = json.loads(response.read().decode())
        if isinstance(data, dict) and data.get("error"):
            return {
                "ok": False,
                "endpoint": endpoint,
                "note": f"A2A banking agent returned an error from {endpoint}.",
                "text": json.dumps(data["error"])[:420],
            }
        result = data.get("result", data) if isinstance(data, dict) else data
        text = _extract_a2a_text(result) or json.dumps(result)[:420]
        return {
            "ok": True,
            "endpoint": endpoint,
            "note": f"Live A2A banking agent reached at {endpoint} with contextId {context_id}.",
            "text": text[:700],
        }
    except Exception as exc:  # noqa: BLE001 - optional path only.
        return {
            "ok": False,
            "endpoint": endpoint,
            "note": f"A2A enrichment unavailable from {endpoint} ({type(exc).__name__}). Deterministic case data remains active.",
            "text": "",
        }


def _start_full_a2a_transcript_job(url: str, message: str, context_id: str) -> None:
    if _redis_client() is None:
        return
    request_fingerprint = uuid.uuid5(
        uuid.NAMESPACE_URL,
        f"{context_id}:{message}",
    ).hex
    _write_full_a2a_status(
        context_id,
        {
            "status": "running",
            "contextId": context_id,
            "requestId": request_fingerprint,
            "message": "Full banking-agent A2A response is running in the background.",
            "updatedAt": int(time.time()),
        },
    )

    def run() -> None:
        started = time.time()
        result = _call_full_a2a(url, message, context_id)
        status = "complete" if result["ok"] else "failed"
        _write_full_a2a_status(
            context_id,
            {
                "status": status,
                "contextId": context_id,
                "requestId": request_fingerprint,
                "endpoint": result["endpoint"],
                "message": result["note"],
                "text": result["text"],
                "elapsedSeconds": round(time.time() - started, 2),
                "updatedAt": int(time.time()),
            },
        )

    thread = threading.Thread(
        target=run,
        name=f"rho-full-a2a-{context_id}",
        daemon=True,
    )
    thread.start()


def _a2a_probe_message(user_message: str) -> str:
    """Bounded A2A probe for the UI demo.

    The Track 1 agents can spend minutes on a real banking task because they may
    call customer service, the env API, RAG, and Vertex. Rho Signal Room only
    needs to prove the UI backend used live A2A before rendering the case room.
    Keep this message intentionally narrow so `message/send` validates the
    agent/card/context path without starting a full harness task.
    """
    clipped = " ".join(user_message.split())[:180]
    return (
        "Rho Signal Room integration probe. Reply in one short sentence that "
        "the A2A personal agent is reachable for this contextId. Do not call "
        "customer service and do not call tools. Original user request for UI "
        f"context only: {clipped}"
    )


def _live_a2a_enabled(runtime: ToolRuntime[Any] | None) -> bool:
    if runtime is None:
        return True
    for entry in runtime.state.get("copilotkit", {}).get("context", []):
        if not isinstance(entry, dict):
            continue
        if entry.get("description") != "Rho Signal Room live A2A mode":
            continue
        raw = entry.get("value")
        try:
            value = json.loads(raw) if isinstance(raw, str) else raw
        except json.JSONDecodeError:
            continue
        if isinstance(value, dict) and isinstance(value.get("a2aEnabled"), bool):
            return value["a2aEnabled"]
    return True


def _tool_for(kind: CaseKind, stage: CaseStage) -> dict[str, Any]:
    tool = {
        "referral": {
            "actor": "personal",
            "toolName": "submit_referral",
            "arguments": [
                {"key": "friend_name", "value": "Dana"},
                {"key": "account_type", "value": "Blue Account"},
                {"key": "confirmation", "value": "pending user approval"},
            ],
            "status": "proposed",
            "resultSummary": "The personal agent has enough policy context to prepare the user-side referral action. It still needs real friend contact details before execution.",
            "riskLevel": "low",
        },
        "dispute": {
            "actor": "customer_service",
            "toolName": "open_dispute_case",
            "arguments": [
                {"key": "verification", "value": "2 factors required"},
                {"key": "transaction", "value": "selected after lookup"},
                {"key": "reason", "value": "unrecognized charge"},
            ],
            "status": "blocked",
            "resultSummary": "The CS agent must verify identity before retrieving transaction details or filing the dispute.",
            "riskLevel": "high",
        },
        "account_closure": {
            "actor": "customer_service",
            "toolName": "start_account_closure",
            "arguments": [
                {"key": "balance", "value": "$12.48 remaining"},
                {"key": "pending_transfer", "value": "1 outbound ACH"},
                {"key": "linked_card", "value": "virtual card active"},
            ],
            "status": "blocked",
            "resultSummary": "The CS agent found closure dependencies that must be cleared before an account closure tool can run.",
            "riskLevel": "medium",
        },
        "human_transfer": {
            "actor": "customer_service",
            "toolName": "schedule_human_transfer",
            "arguments": [
                {"key": "policy_gate", "value": "try support path first"},
                {"key": "repeat_count", "value": "1 of 4"},
                {"key": "reason", "value": "user requested transfer"},
            ],
            "status": "proposed",
            "resultSummary": "Policy says the CS agent should help first when the issue is within capability, then transfer after repeated requests or unresolved blockers.",
            "riskLevel": "medium",
        },
    }[kind]

    if kind == "dispute":
        if stage == "verified":
            tool["status"] = "proposed"
            tool["resultSummary"] = "Identity is verified. The CS agent can now propose dispute filing while keeping execution behind explicit approval."
        elif stage == "approved":
            tool["status"] = "running"
            tool["resultSummary"] = "Approval captured. The dispute filing tool is running with the verified transaction context."
        elif stage == "completed":
            tool["status"] = "complete"
            tool["resultSummary"] = "Dispute case opened and receipt generated with policy evidence, relay path, and tool-call record."
    elif kind == "account_closure":
        if stage == "verified":
            tool["status"] = "proposed"
            tool["resultSummary"] = "Identity is verified. The UI generated the closure dependency checklist before proposing account closure."
        elif stage == "approved":
            tool["status"] = "running"
            tool["resultSummary"] = "Closure blockers are being cleared in order before final closure execution."
        elif stage == "completed":
            tool["status"] = "complete"
            tool["resultSummary"] = "Closure readiness receipt generated. Remaining dependencies are documented for audit review."
    elif stage == "approved":
        tool["status"] = "running"
    elif stage == "completed":
        tool["status"] = "complete"

    return tool


def _next_action_for(kind: CaseKind, stage: CaseStage) -> dict[str, str]:
    if stage == "completed":
        return {
            "label": "Export audit receipt",
            "event": "export_audit_receipt",
            "caption": "Download the replayable policy, handoff, and tool-call receipt.",
        }
    if stage == "approved":
        return {
            "label": "Complete case",
            "event": "complete_case",
            "caption": "Finalize the outcome receipt after tool execution.",
        }
    if stage == "verified":
        return {
            "label": "Approve tool action",
            "event": "approve_tool_action",
            "caption": "Approve the proposed regulated tool call.",
        }
    if kind in {"dispute", "account_closure"}:
        return {
            "label": "Confirm verified factors",
            "event": "verify_identity",
            "caption": "Move from locked intake to policy-backed tool planning.",
        }
    return {
        "label": "Approve tool action",
        "event": "approve_tool_action",
        "caption": "Approve the proposed user-side action.",
    }


def _case_rows(kind: CaseKind, stage: CaseStage) -> list[dict[str, str]]:
    if kind == "account_closure":
        return [
            {"item": "Identity verification", "state": "complete" if stage != "intake" else "locked", "owner": "CS agent"},
            {"item": "Remaining balance", "state": "$12.48 must be transferred", "owner": "User"},
            {"item": "Pending ACH", "state": "wait or cancel", "owner": "Personal agent"},
            {"item": "Virtual card", "state": "must be disabled", "owner": "CS agent"},
        ]
    if kind == "dispute":
        return [
            {"item": "Identity verification", "state": "complete" if stage != "intake" else "required", "owner": "CS agent"},
            {"item": "Transaction lookup", "state": "ready" if stage != "intake" else "blocked", "owner": "CS agent"},
            {"item": "Dispute reason", "state": "unrecognized charge", "owner": "User"},
            {"item": "Filing approval", "state": "captured" if stage in {"approved", "completed"} else "pending", "owner": "User"},
        ]
    if kind == "human_transfer":
        return [
            {"item": "Capability check", "state": "within agent support", "owner": "CS agent"},
            {"item": "Repeat request count", "state": "1 of 4", "owner": "Policy"},
            {"item": "Escalation route", "state": "available after blocker", "owner": "Supervisor"},
        ]
    return [
        {"item": "Referral policy", "state": "eligible path", "owner": "CS agent"},
        {"item": "Friend details", "state": "missing contact fields", "owner": "User"},
        {"item": "Referral submission", "state": "pending approval", "owner": "Personal agent"},
    ]


def _stage_status(stage: CaseStage, fallback: str) -> str:
    return {
        "intake": fallback,
        "verified": "Verified; tool proposed",
        "approved": "Approved; tool running",
        "completed": "Completed; receipt ready",
    }[stage]


def _required_integration_status(
    check: IntegrationCheck,
    *,
    live_a2a_enabled: bool,
) -> IntegrationCheck:
    if check["ok"]:
        return {**check, "status": "live"}
    if live_a2a_enabled:
        return {**check, "status": "blocked"}
    return {**check, "status": "off"}


def _truthy_env(name: str) -> bool:
    return os.getenv(name, "").strip().lower() in {"1", "true", "yes", "on"}


def _gemini_api_key() -> str | None:
    return os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")


def _gemini_check() -> IntegrationCheck:
    if _gemini_api_key() and os.getenv("BANKING_DISABLE_GENERATIVE_UI") != "1":
        return {
            "name": "Gemini",
            "ok": True,
            "status": "live",
            "message": "Gemini layout composition is available server-side.",
        }
    return {
        "name": "Gemini",
        "ok": False,
        "status": "off",
        "message": "GOOGLE_API_KEY/GEMINI_API_KEY is missing or generative UI is disabled, so deterministic A2UI layout is used.",
    }


def integration_health_snapshot(*, live_a2a_enabled: bool) -> list[dict[str, str]]:
    """Public integration status summary without secret values or network probes."""
    checks: list[IntegrationCheck] = [
        _required_integration_status(
            {
                "name": "A2A",
                "ok": bool(live_a2a_enabled and os.getenv("BANKING_A2A_AGENT_URL")),
                "status": "off",
                "message": "Live A2A handoff endpoint is configured server-side."
                if live_a2a_enabled and os.getenv("BANKING_A2A_AGENT_URL")
                else "Live A2A handoff is off or missing server-side configuration.",
            },
            live_a2a_enabled=live_a2a_enabled,
        ),
        _required_integration_status(
            {
                "name": "Redis",
                "ok": bool(os.getenv("REDIS_URL")),
                "status": "off",
                "message": "Redis case memory is configured server-side."
                if os.getenv("REDIS_URL")
                else "Redis case memory is not configured server-side.",
            },
            live_a2a_enabled=live_a2a_enabled,
        ),
        _required_integration_status(
            {
                "name": "LinkUp",
                "ok": bool(os.getenv("LINKUP_API_KEY")),
                "status": "off",
                "message": "LinkUp public evidence search is configured server-side."
                if os.getenv("LINKUP_API_KEY")
                else "LinkUp public evidence search is not configured server-side.",
            },
            live_a2a_enabled=live_a2a_enabled,
        ),
        _gemini_check(),
    ]
    return [
        {
            "name": check["name"],
            "status": check["status"],
            "message": check["message"],
        }
        for check in checks
    ]


def _receipt_for(
    kind: CaseKind,
    tool: dict[str, Any],
    next_action: dict[str, str],
    integration_checks: list[IntegrationCheck],
) -> dict[str, str]:
    required = "A2A handoff, Redis memory, LinkUp evidence, Gemini A2UI composer"
    next_safe_action = {
        "referral": next_action["label"],
        "dispute": next_action["label"],
        "account_closure": next_action["label"],
        "human_transfer": "continue CS-agent support before escalation",
    }[kind]
    not_performed = {
        "referral": "Referral submission was not executed; friend contact details and user approval are still required.",
        "dispute": "No transaction lookup or dispute filing was performed before identity verification and explicit approval.",
        "account_closure": "No account closure was performed; balance, pending transfer, and card blockers remain documented.",
        "human_transfer": "Human transfer was not scheduled; policy requires the agent support path before escalation.",
    }[kind]
    return {
        "requiredTechUsed": required,
        "toolStatus": str(tool["status"]),
        "nextSafeAction": next_safe_action,
        "notPerformed": not_performed,
    }


def _build_payload(
    kind: CaseKind,
    request_text: str,
    context_id: str,
    *,
    case_stage: CaseStage = "intake",
    live_a2a_enabled: bool = True,
) -> dict[str, Any]:
    intent, status, active_agent = _status_for(kind)
    tool = _tool_for(kind, case_stage)
    relay = {
        "nodes": [
            {"id": "user", "label": "User", "role": "Request source", "status": "complete"},
            {"id": "personal", "label": "Personal agent", "role": "User-side A2A agent", "status": "active" if active_agent == "Personal agent" else "complete"},
            {"id": "cs", "label": "CS agent", "role": "Bank-side A2A agent", "status": "active" if active_agent == "CS agent" else "complete"},
            {"id": "kb", "label": "Rho KB", "role": "Policy retrieval", "status": "complete"},
            {"id": "tools", "label": "Env tools", "role": "Action boundary", "status": "blocked" if tool["status"] == "blocked" else "idle"},
        ],
        "edges": [
            {"from": "user", "to": "personal", "label": request_text[:74], "status": "complete"},
            {"from": "personal", "to": "cs", "label": "Policy and procedure check", "status": "complete"},
            {"from": "cs", "to": "kb", "label": "Retrieve policy evidence", "status": "complete"},
            {"from": "cs", "to": "tools", "label": "Tool eligibility reviewed", "status": "blocked" if tool["status"] == "blocked" else "pending"},
        ],
    }
    linkup, linkup_check = _linkup_sources(kind)
    policy = {
        "queries": {
            "referral": ["referral Blue Account", "submit_referral", "user discoverable tool"],
            "dispute": ["card dispute verification", "open_card_dispute", "identity factors"],
            "account_closure": ["account closure blockers", "zero balance", "authorized users"],
            "human_transfer": ["human transfer policy", "capability-first support", "repeat request"],
        }[kind],
        "sources": [],
        "selectedSourceId": {
            "referral": "kb-referral",
            "dispute": "kb-verification",
            "account_closure": "kb-closure",
            "human_transfer": "kb-transfer",
        }[kind],
        "confidence": "high" if kind != "human_transfer" else "medium",
    }
    a2a: A2AEnrichment | None = None
    a2a_url = os.getenv("BANKING_A2A_AGENT_URL")
    if live_a2a_enabled and a2a_url:
        a2a = _call_a2a(a2a_url, request_text, context_id)
    redis_source, redis_check = _redis_source(context_id)
    a2a_check = _a2a_check(
        live_a2a_enabled=live_a2a_enabled,
        a2a_url=a2a_url,
        a2a=a2a,
    )
    integration_checks = [
        _required_integration_status(a2a_check, live_a2a_enabled=live_a2a_enabled),
        _required_integration_status(redis_check, live_a2a_enabled=live_a2a_enabled),
        _required_integration_status(linkup_check, live_a2a_enabled=live_a2a_enabled),
        _gemini_check(),
    ]
    strict_integrations_required = live_a2a_enabled
    readiness_blockers = [
        check
        for check in integration_checks
        if strict_integrations_required and check["name"] in {"A2A", "Redis", "LinkUp"} and not check["ok"]
    ]
    if not live_a2a_enabled:
        a2a_note = "Live A2A is off for this run. The case room is using deterministic banking fixtures only."
    elif not a2a_url:
        a2a_note = "Live A2A is on, but BANKING_A2A_AGENT_URL is unset. Set it to http://localhost:9001 to enrich this case from the banking personal agent."
    elif a2a and a2a["text"]:
        a2a_note = f"{a2a['note']} Response: {a2a['text']}"
    elif a2a:
        a2a_note = a2a["note"]
    else:
        a2a_note = "Live A2A is on, but no A2A response was available for this run."
    summary = {
        "intent": "Integration readiness" if readiness_blockers else intent,
        "status": "Required tech missing" if readiness_blockers else _stage_status(case_stage, status),
        "caseKind": kind,
        "stage": case_stage,
        "activeAgent": active_agent,
        "request": request_text,
        "a2a": a2a_note,
        "a2aEnabled": live_a2a_enabled,
        "a2aLive": bool(a2a and a2a["ok"]),
        "strictIntegrationsRequired": strict_integrations_required,
        "integrationChecks": integration_checks,
    }
    if a2a and a2a["ok"]:
        _start_full_a2a_transcript_job(a2a_url or "", request_text, context_id)
        relay["nodes"].append(
            {
                "id": "live-a2a",
                "label": "Live A2A",
                "role": "Banking personal agent",
                "status": "complete",
            }
        )
        relay["edges"].append(
            {
                "from": "personal",
                "to": "live-a2a",
                "label": "Live A2A handoff",
                "status": "complete",
            }
        )
    if readiness_blockers:
        tool = {
            "actor": "system",
            "toolName": "configure_required_hackathon_integrations",
            "arguments": [
                {"key": check["name"], "value": check["message"]}
                for check in readiness_blockers
            ],
            "status": "blocked",
            "resultSummary": "The generated case room is blocked because required hackathon integrations were not actually used. Configure the missing server-side integrations or turn Live A2A off to enter explicit fixture mode.",
            "riskLevel": "high",
        }

    payload: dict[str, Any] = {
        "summary": summary,
        "relay": relay,
        "tool": tool,
        "policy": policy,
        "contextId": context_id,
        "nextAction": _next_action_for(kind, case_stage),
        "caseRows": _case_rows(kind, case_stage),
        "stageMetrics": [
            {
                "label": "Verification",
                "value": "2/2" if case_stage != "intake" else "0/2",
                "delta": "locked" if case_stage == "intake" else "clear",
                "deltaTone": "negative" if case_stage == "intake" else "positive",
                "caption": "Identity factors before private account actions.",
            },
            {
                "label": "Evidence",
                "value": str(len(policy["sources"])),
                "delta": "+live" if summary["a2aLive"] else "fixture",
                "deltaTone": "positive" if summary["a2aLive"] else "neutral",
                "caption": "Policy, LinkUp, Redis, and A2A sources included.",
            },
            {
                "label": "Risk",
                "value": tool["riskLevel"].title(),
                "delta": tool["status"],
                "deltaTone": "negative" if tool["riskLevel"] == "high" else "neutral",
                "caption": "Tool action state for regulated support review.",
            },
        ],
        "outcome": {
            "title": {
                "referral": "Referral case prepared",
                "dispute": "Dispute case gated by verification",
                "account_closure": "Account closure dependencies mapped",
                "human_transfer": "Human transfer held at policy gate",
            }[kind] if not readiness_blockers else "Integration readiness blocked",
            "body": {
                "referral": "The UI generated a user-side referral plan, identified missing details, and kept the action out of the bank-tool boundary.",
                "dispute": "The UI generated a verification-first case path so private transaction data is not exposed before policy conditions are met.",
                "account_closure": "The UI generated a dependency-first closure path so blockers are visible before any irreversible account action.",
                "human_transfer": "The UI generated the transfer policy boundary and shows why immediate escalation is not the first action.",
            }[kind] if not readiness_blockers else "Live A2A mode is submission mode: A2A, Redis, and LinkUp must be configured and reachable. The app did not silently substitute deterministic evidence for missing required integrations.",
        },
    }
    payload["receipt"] = _receipt_for(
        kind,
        payload["tool"],
        payload["nextAction"],
        integration_checks,
    )
    payload["policy"]["sources"] = _policy_sources(
        kind,
        linkup,
        redis_source,
        [
            check
            for check in integration_checks
            if check["name"] in {"A2A", "Redis", "LinkUp"} and strict_integrations_required
        ]
        or [integration_checks[0]],
    )
    if a2a and a2a["ok"]:
        payload["policy"]["sources"].append(
            {
                "id": "a2a-live-response",
                "title": "Full A2A response",
                "source": "A2A personal-agent",
                "excerpt": a2a["text"] or a2a["note"],
            }
        )
    payload["stageMetrics"][1]["value"] = str(len(payload["policy"]["sources"]))
    _store_redis(context_id, payload)
    return payload


def _components(payload: dict[str, Any]) -> list[dict[str, Any]]:
    summary = payload["summary"]
    next_action = payload["nextAction"]
    return [
        {
            "id": "root",
            "component": "Stack",
            "gap": "md",
            "children": ["header", "metrics", "relay", "main-grid", "outcome"],
        },
        {"id": "header", "component": "Card", "child": "header-stack"},
        {
            "id": "header-stack",
            "component": "Stack",
            "gap": "sm",
            "children": ["case-row", "case-title", "case-text", "a2a-note", "next-action-row"],
        },
        {
            "id": "case-row",
            "component": "Row",
            "gap": "sm",
            "children": ["intent-badge", "status-badge", "agent-badge"],
        },
        {"id": "intent-badge", "component": "Badge", "label": summary["intent"], "tone": "info"},
        {"id": "status-badge", "component": "Badge", "label": summary["status"], "tone": "warning" if "required" in summary["status"].lower() else "positive"},
        {"id": "agent-badge", "component": "Badge", "label": summary["activeAgent"], "tone": "neutral"},
        {
            "id": "case-title",
            "component": "Heading",
            "level": "1",
            "text": payload["outcome"]["title"],
        },
        {
            "id": "case-text",
            "component": "Text",
            "text": payload["outcome"]["body"],
            "tone": "muted",
        },
        {
            "id": "a2a-note",
            "component": "Callout",
            "tone": "neutral",
            "title": "Live A2A handoff",
            "body": summary["a2a"],
        },
        {
            "id": "next-action-row",
            "component": "Row",
            "gap": "sm",
            "align": "center",
            "children": ["next-action", "next-action-caption"],
        },
        {
            "id": "next-action",
            "component": "Button",
            "label": next_action["label"],
            "variant": "primary" if summary["stage"] != "completed" else "secondary",
            "action": {
                "event": {
                    "name": next_action["event"],
                    "context": {
                        "caseKind": summary["caseKind"],
                        "stage": summary["stage"],
                        "contextId": payload["contextId"],
                    },
                }
            },
        },
        {
            "id": "next-action-caption",
            "component": "Text",
            "text": next_action["caption"],
            "tone": "muted",
            "size": "sm",
        },
        {
            "id": "metrics",
            "component": "Grid",
            "columns": 3,
            "gap": "md",
            "children": ["metric-verification", "metric-evidence", "metric-risk"],
        },
        {
            "id": "metric-verification",
            "component": "StatCard",
            **payload["stageMetrics"][0],
        },
        {
            "id": "metric-evidence",
            "component": "StatCard",
            **payload["stageMetrics"][1],
        },
        {
            "id": "metric-risk",
            "component": "StatCard",
            **payload["stageMetrics"][2],
        },
        {
            "id": "relay",
            "component": "AgentRelayMap",
            "nodes": payload["relay"]["nodes"],
            "edges": payload["relay"]["edges"],
            "activeNodeId": "personal" if summary["activeAgent"] == "Personal agent" else "cs",
            "contextId": payload["contextId"],
        },
        {
            "id": "main-grid",
            "component": "Grid",
            "columns": 2,
            "gap": "md",
            "children": ["policy", "case-table", "tool"],
        },
        {
            "id": "policy",
            "component": "PolicyRadar",
            "queries": payload["policy"]["queries"],
            "sources": payload["policy"]["sources"],
            "selectedSourceId": payload["policy"]["selectedSourceId"],
            "confidence": payload["policy"]["confidence"],
        },
        {
            "id": "case-table",
            "component": "DataTable",
            "columns": [
                {"key": "item", "label": "Case item"},
                {"key": "state", "label": "State"},
                {"key": "owner", "label": "Owner"},
            ],
            "rows": payload["caseRows"],
        },
        {
            "id": "tool",
            "component": "ToolActionCard",
            "actor": payload["tool"]["actor"],
            "toolName": payload["tool"]["toolName"],
            "arguments": payload["tool"]["arguments"],
            "status": payload["tool"]["status"],
            "resultSummary": payload["tool"]["resultSummary"],
            "riskLevel": payload["tool"]["riskLevel"],
        },
        {
            "id": "outcome",
            "component": "Callout",
            "tone": "positive" if payload["tool"]["status"] != "blocked" else "warning",
            "title": "Outcome receipt",
            "body": (
                f"{payload['outcome']['title']}. "
                f"Required tech used: {payload['receipt']['requiredTechUsed']}. "
                f"Tool status: {payload['receipt']['toolStatus']}. "
                f"Next safe action: {payload['receipt']['nextSafeAction']}. "
                f"Not performed: {payload['receipt']['notPerformed']} "
                f"Evidence count: {len(payload['policy']['sources'])}."
            ),
        },
    ]


@lc_tool
def render_banking_a2ui(
    surfaceId: str,
    catalogId: str,
    components_json: str,
    data_json: str = "{}",
) -> str:
    """No-op structured output target for banking A2UI surface composition."""
    return "rendered"


_CASE_RENDER_MODEL: ChatGoogleGenerativeAI | None = None


def _case_render_model() -> ChatGoogleGenerativeAI:
    global _CASE_RENDER_MODEL
    if _CASE_RENDER_MODEL is None:
        model_kwargs: dict[str, Any] = {
            "model": os.getenv("MODEL", "gemini-3.5-flash"),
            "temperature": 0.35,
        }
        api_key = _gemini_api_key()
        if api_key:
            model_kwargs["api_key"] = api_key
        if _truthy_env("GOOGLE_GENAI_USE_VERTEXAI"):
            model_kwargs["vertexai"] = True
            if os.getenv("GOOGLE_CLOUD_PROJECT"):
                model_kwargs["project"] = os.environ["GOOGLE_CLOUD_PROJECT"]
            if os.getenv("GOOGLE_CLOUD_LOCATION"):
                model_kwargs["location"] = os.environ["GOOGLE_CLOUD_LOCATION"]
        _CASE_RENDER_MODEL = ChatGoogleGenerativeAI(**model_kwargs)
    return _CASE_RENDER_MODEL


def generate_case_surface(payload: dict[str, Any]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Compose the visible banking surface, falling back to deterministic UI.

    The payload is deterministic and policy-bound. Gemini may only choose the
    A2UI component tree and layout emphasis.
    """
    fallback = _components(payload)
    fallback_data = {"case": payload}
    if os.getenv("BANKING_DISABLE_GENERATIVE_UI") == "1" or not _gemini_api_key():
        return fallback, fallback_data

    prompt = (
        "You are composing a generated A2UI surface for Rho Signal Room, an "
        "AI case-audit panel for regulated banking support.\n\n"
        "Use the payload facts exactly. Do not invent account data, policy, "
        "tool results, integration status, or evidence. Your job is layout "
        "composition only: choose which existing components to use, what is "
        "prominent, and what next action is visible.\n\n"
        f"catalogId: {CATALOG_ID}\n\n"
        f"{CATALOG_PROMPT}\n\n"
        "Rules for this surface:\n"
        "- Use ONLY components in the catalog.\n"
        "- Exactly one component must have id='root'.\n"
        "- Every component must be reachable from root.\n"
        "- Use at least one banking-specific component: AgentRelayMap, "
        "ToolActionCard, or PolicyRadar.\n"
        "- Include a Button for payload.nextAction unless stage is completed; "
        "completed may use an export receipt Button.\n"
        "- Do not use the same layout for every case. Disputes should lead "
        "with verification/risk, account closure with dependency blockers, "
        "referrals with missing info, and human transfer with policy gate.\n"
        "- Keep text concise. Make the first viewport visually dense and useful.\n\n"
        "Pass COMPLETE STRICT JSON strings to render_banking_a2ui. Inline "
        "component props when possible. Use data_json with {'case': payload} "
        "only if you bind paths.\n\n"
        f"Payload JSON:\n{json.dumps(payload, ensure_ascii=False)}"
    )
    try:
        model_with_tool = _case_render_model().bind_tools(
            [render_banking_a2ui],
            tool_choice="render_banking_a2ui",
        )
        response = model_with_tool.invoke(
            [
                SystemMessage(content="Compose one banking A2UI surface."),
                HumanMessage(content=prompt),
            ]
        )
        if not response.tool_calls:
            return fallback, fallback_data
        args = response.tool_calls[0]["args"]
        components = _normalize_component_tree(json.loads(args.get("components_json", "[]")))
        data = json.loads(args.get("data_json", "{}") or "{}")
        if not _valid_component_tree(components):
            return fallback, fallback_data
        if not isinstance(data, dict):
            data = {}
        data.setdefault("case", payload)
        return components, data
    except Exception as exc:  # noqa: BLE001 - demo must keep rendering.
        print(f"[banking_agent] generative case surface failed: {type(exc).__name__}: {exc}")
        return fallback, fallback_data


def _normalize_component_tree(components: Any) -> Any:
    if not isinstance(components, list):
        return components
    normalized = []
    for component in components:
        if not isinstance(component, dict):
            normalized.append(component)
            continue
        next_component = dict(component)
        if "component" not in next_component and isinstance(next_component.get("type"), str):
            next_component["component"] = next_component["type"]
        normalized.append(next_component)
    return normalized


def _valid_component_tree(components: Any) -> bool:
    if not isinstance(components, list) or not components:
        return False
    ids = set()
    root_count = 0
    for component in components:
        if not isinstance(component, dict):
            return False
        component_id = component.get("id")
        if not isinstance(component_id, str) or not component_id:
            return False
        if component_id in ids:
            return False
        ids.add(component_id)
        if component_id == "root":
            root_count += 1
        if not isinstance(component.get("component"), str):
            return False
    return root_count == 1


@tool
def render_case_room(
    case_kind: CaseKind,
    case_stage: CaseStage,
    user_request: str,
    context_id: str,
    runtime: ToolRuntime[Any],
) -> str:
    """Render a generated banking case room for the current support request."""
    payload = _build_payload(
        case_kind,
        user_request,
        context_id,
        case_stage=case_stage,
        live_a2a_enabled=_live_a2a_enabled(runtime),
    )
    components, data = generate_case_surface(payload)
    return a2ui.render(
        operations=[
            a2ui.create_surface(SURFACE, catalog_id=CATALOG_ID),
            a2ui.update_components(SURFACE, components),
            a2ui.update_data_model(SURFACE, {"updatedAt": int(time.time()), **data}),
        ]
    )


class BankingCaseModel(BaseChatModel):
    """Deterministic model that turns each user turn into one case-room render."""

    @property
    def _llm_type(self) -> str:
        return "rho-signal-room-stub"

    def bind_tools(self, tools: Any, **kwargs: Any) -> "BankingCaseModel":
        return self

    def bind(self, **kwargs: Any) -> "BankingCaseModel":
        return self

    def _generate(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: Any | None = None,
        **kwargs: Any,
    ) -> ChatResult:
        if messages and isinstance(messages[-1], ToolMessage) and _is_case_room_tool_message(messages[-1]):
            message: BaseMessage = AIMessage(content="Case room rendered.")
        else:
            text = _latest_case_request(messages)
            kind = _case_kind(text)
            stage = _case_stage(messages)
            args: CaseArgs = {
                "case_kind": kind,
                "case_stage": stage,
                "user_request": text,
                "context_id": _context_id(kind),
            }
            message = AIMessage(
                content="",
                tool_calls=[
                    {
                        "name": TOOL_NAME,
                        "args": dict(args),
                        "id": f"call_{uuid.uuid4().hex[:12]}",
                    }
                ],
            )
        return ChatResult(generations=[ChatGeneration(message=message)])


def _is_case_room_tool_message(message: ToolMessage) -> bool:
    if getattr(message, "name", None) == TOOL_NAME:
        return True
    content = _text_of(message)
    return "a2ui_operations" in content and SURFACE in content


SYSTEM_PROMPT = f"""\
You are Rho Signal Room, a generative banking case-room agent.

For every user request, render the current case as A2UI. The UI is the answer:
show the agent relay, policy evidence, proposed tool action, and outcome
receipt. Keep banking policy grounded in Rho-Bank KB assumptions. LinkUp is
only for public evidence. Redis is only for demo case memory.

{CATALOG_PROMPT}
"""


def build_banking_agent():
    return create_agent(
        model=BankingCaseModel(),
        tools=[render_case_room],
        system_prompt=SYSTEM_PROMPT,
        middleware=[CopilotKitMiddleware()],
        checkpointer=MemorySaver(),
    )


graph = build_banking_agent()
