"""Hybrid Gemini classification + policy-rationale layer for Rho Signal Room.

This is the HYBRID core of the /fixed banking demo. The LLM owns the *meaning*
of a turn — which banking case it is, a conservative policy rationale, the next
safe action, and any extracted entities — while the deterministic layout code
(``banking_agent.generate_case_surface`` / ``_components``) owns the A2UI
component tree.

Why a separate module: ``banking_agent`` imports the keyword router and
``reason_about_case`` from here, so this file must NOT import ``banking_agent``
(circular import). The keyword fallback router therefore lives here and
``banking_agent._case_kind`` delegates to it.

Offline / smoke safety: ``reason_about_case`` only touches Gemini when
``live=True`` AND an API key is present. On ANY failure (no key, timeout >8s,
invalid JSON, network error) it returns the deterministic keyword-router
fallback with ``source="fallback"`` and NEVER raises. The construction of the
``ChatGoogleGenerativeAI`` client is deferred to first use so importing this
module offline (no key) is free — mirroring the canonical lazy pattern in
``dynamic_agent.py``.
"""
from __future__ import annotations

import json
import os
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
from typing import Any, Literal, TypedDict

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.tools import tool as lc_tool
from langchain_google_genai import ChatGoogleGenerativeAI

CaseKind = Literal[
    "referral",
    "dispute",
    "human_transfer",
    "account_closure",
    "unknown",
]
Confidence = Literal["low", "medium", "high"]

KNOWN_CASE_KINDS: tuple[CaseKind, ...] = (
    "referral",
    "dispute",
    "human_transfer",
    "account_closure",
)

REASONING_TIMEOUT_SECONDS = 8.0


class CaseReasoning(TypedDict):
    case_kind: CaseKind
    confidence: Confidence
    policy_rationale: str
    next_action: str
    extracted_fields: dict[str, str]
    source: Literal["llm", "fallback"]


# ── Deterministic keyword router (offline fallback) ───────────────────────────
def keyword_case_kind(text: str) -> CaseKind:
    """Classify a banking request by keyword.

    Returns ``"unknown"`` (not ``"referral"``) when nothing matches so an
    off-script prompt renders the safe generic room instead of a wrong one.
    """
    lower = text.lower()
    if any(
        phrase in lower
        for phrase in [
            "close account",
            "account closure",
            "close my account",
            "close the account",
        ]
    ):
        return "account_closure"
    if any(word in lower for word in ["dispute", "charge", "transaction", "fraud"]):
        return "dispute"
    if any(word in lower for word in ["human", "representative", "agent now", "manager"]):
        return "human_transfer"
    if any(
        word in lower
        for word in ["refer", "referral", "friend", "invite", "blue account"]
    ):
        return "referral"
    return "unknown"


FALLBACK_RATIONALE: dict[CaseKind, str] = {
    "referral": (
        "Referral stays on the user side: the assistant can prepare the referral "
        "but needs real friend contact details and explicit user approval before "
        "anything is submitted. No account data is invented."
    ),
    "dispute": (
        "Card disputes are verification-first: identity must be confirmed with two "
        "factors before any transaction lookup or dispute filing. Private account "
        "data is never disclosed before that gate clears."
    ),
    "account_closure": (
        "Account closure is dependency-first: balance, pending transfers, and linked "
        "cards are reviewed and cleared before any irreversible closure step runs."
    ),
    "human_transfer": (
        "Policy is capability-first: the support agent attempts to resolve the issue "
        "within its remit before escalating to a human specialist."
    ),
    "unknown": (
        "The request did not match a known banking case. The assistant offers the "
        "supported paths and asks the user to confirm the case type before taking "
        "any action."
    ),
}

FALLBACK_NEXT_ACTION: dict[CaseKind, str] = {
    "referral": "Collect the friend's real contact details, then ask the user to approve the referral.",
    "dispute": "Confirm two identity factors before looking up the transaction or filing a dispute.",
    "account_closure": "Verify identity, then walk through the closure dependency checklist.",
    "human_transfer": "Continue the in-capability support path before scheduling a human handoff.",
    "unknown": "Ask the user whether this is a dispute, account closure, referral, or escalation.",
}

FALLBACK_CONFIDENCE: dict[CaseKind, Confidence] = {
    "referral": "medium",
    "dispute": "medium",
    "account_closure": "medium",
    "human_transfer": "medium",
    "unknown": "low",
}


def _fallback_reasoning(user_text: str) -> CaseReasoning:
    kind = keyword_case_kind(user_text)
    return {
        "case_kind": kind,
        "confidence": FALLBACK_CONFIDENCE[kind],
        "policy_rationale": FALLBACK_RATIONALE[kind],
        "next_action": FALLBACK_NEXT_ACTION[kind],
        "extracted_fields": {},
        "source": "fallback",
    }


# ── Gemini-backed reasoning ───────────────────────────────────────────────────
def _gemini_api_key() -> str | None:
    return os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")


@lc_tool
def record_case_reasoning(result_json: str) -> str:
    """Record the structured banking case reasoning.

    Args:
        result_json: A STRICT JSON object string with exactly these keys:
            - case_kind: one of "referral", "dispute", "account_closure",
              "human_transfer", "unknown".
            - confidence: one of "low", "medium", "high".
            - policy_rationale: 1-2 sentence conservative Rho-Bank policy
              rationale for how this case is handled.
            - next_action: ONE safe next action, as a short sentence.
            - extracted_fields: an object whose keys and values are BOTH plain
              strings (e.g. {"friend_name": "Dana", "charge": "$48 at ACME"}).
              Use {} when nothing concrete was stated.
    """
    return "recorded"


_REASONER_MODEL: ChatGoogleGenerativeAI | None = None


def _reasoner_model() -> ChatGoogleGenerativeAI:
    global _REASONER_MODEL
    if _REASONER_MODEL is None:
        model_kwargs: dict[str, Any] = {
            "model": os.getenv("MODEL", "gemini-3.5-flash"),
            "temperature": 0,
        }
        api_key = _gemini_api_key()
        if api_key:
            model_kwargs["api_key"] = api_key
        if os.getenv("GOOGLE_GENAI_USE_VERTEXAI", "").strip().lower() in {
            "1",
            "true",
            "yes",
            "on",
        }:
            model_kwargs["vertexai"] = True
            if os.getenv("GOOGLE_CLOUD_PROJECT"):
                model_kwargs["project"] = os.environ["GOOGLE_CLOUD_PROJECT"]
            if os.getenv("GOOGLE_CLOUD_LOCATION"):
                model_kwargs["location"] = os.environ["GOOGLE_CLOUD_LOCATION"]
        _REASONER_MODEL = ChatGoogleGenerativeAI(**model_kwargs)
    return _REASONER_MODEL


_SYSTEM_PROMPT = """\
You are the classification and policy-reasoning layer of Rho Signal Room, an
AI case-audit panel for regulated consumer-banking support.

Classify the user's request into EXACTLY ONE case_kind:
- "referral"         — referring a friend/another person for an account.
- "dispute"          — an unrecognized/incorrect card charge or transaction.
- "account_closure"  — closing or cancelling their account.
- "human_transfer"   — asking for a human / representative / manager.
- "unknown"          — anything that does not clearly match the four above.

Then write a CONSERVATIVE 1-2 sentence Rho-Bank policy rationale. Hard rules:
- Never invent account data, balances, transaction details, or customer PII.
- Disputes and account closure are verification-first: identity must be
  confirmed before any private lookup or account mutation.
- Referrals stay user-side and require real, user-provided details + approval.
- Human transfer is capability-first: try to help before escalating.
- If the case is "unknown", explain that you will offer the supported paths and
  ask the user to confirm before acting.

Propose ONE safe next_action (a short sentence). Extract any concrete named
entities the user actually stated into extracted_fields (e.g. friend_name,
charge, amount, merchant, account_type) — strings only, and do NOT guess.

Return your answer by calling record_case_reasoning exactly once with a STRICT
JSON object string in result_json (double-quoted keys, no trailing commas, no
comments)."""


def _invoke_reasoner(user_text: str) -> CaseReasoning:
    model_with_tool = _reasoner_model().bind_tools(
        [record_case_reasoning],
        tool_choice="record_case_reasoning",
    )
    response = model_with_tool.invoke(
        [
            SystemMessage(content=_SYSTEM_PROMPT),
            HumanMessage(content=user_text),
        ]
    )
    if not response.tool_calls:
        raise ValueError("reasoner did not call record_case_reasoning")
    raw = response.tool_calls[0]["args"].get("result_json", "")
    parsed = json.loads(raw) if raw else {}
    if not isinstance(parsed, dict):
        raise ValueError("result_json did not parse to an object")
    return _coerce_reasoning(parsed)


def _coerce_reasoning(parsed: dict[str, Any]) -> CaseReasoning:
    kind = parsed.get("case_kind")
    if kind not in (*KNOWN_CASE_KINDS, "unknown"):
        kind = "unknown"
    confidence = parsed.get("confidence")
    if confidence not in ("low", "medium", "high"):
        confidence = "medium"
    rationale = parsed.get("policy_rationale")
    if not isinstance(rationale, str) or not rationale.strip():
        rationale = FALLBACK_RATIONALE[kind]
    next_action = parsed.get("next_action")
    if not isinstance(next_action, str) or not next_action.strip():
        next_action = FALLBACK_NEXT_ACTION[kind]
    raw_fields = parsed.get("extracted_fields")
    extracted: dict[str, str] = {}
    if isinstance(raw_fields, dict):
        for key, value in raw_fields.items():
            if isinstance(key, str) and isinstance(value, (str, int, float)):
                text_value = str(value).strip()
                if text_value:
                    extracted[key] = text_value
    return {
        "case_kind": kind,
        "confidence": confidence,
        "policy_rationale": rationale.strip(),
        "next_action": next_action.strip(),
        "extracted_fields": extracted,
        "source": "llm",
    }


def reason_about_case(user_text: str, *, live: bool) -> CaseReasoning:
    """Classify + reason about a banking request, with a deterministic fallback.

    When ``live`` is True and a Gemini API key is present, ask Gemini for a
    structured classification + conservative policy rationale (8s timeout). On
    ANY failure, fall back to the keyword router and a canned rationale. Never
    raises.
    """
    text = (user_text or "").strip()
    if not text:
        return _fallback_reasoning(text)
    if not live or not _gemini_api_key():
        return _fallback_reasoning(text)
    try:
        with ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(_invoke_reasoner, text)
            return future.result(timeout=REASONING_TIMEOUT_SECONDS)
    except FuturesTimeoutError:
        print("[case_reasoner] Gemini reasoning timed out; using fallback.")
        return _fallback_reasoning(text)
    except Exception as exc:  # noqa: BLE001 - demo must keep rendering offline.
        print(f"[case_reasoner] Gemini reasoning failed ({type(exc).__name__}); using fallback.")
        return _fallback_reasoning(text)
