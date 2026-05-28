# FROZEN.md

**Frozen on:** 2026-05-28
**Forked from:** `CopilotKit/CopilotKit@upstream/main` (commit `23af69041`), path `examples/integrations/langgraph-python`
**Verifier:** `pnpm verify-pins`

This is the canonical source of truth for what version of every load-bearing
dependency this starter runs against. CI re-runs the model-ID probe nightly so
a Google or upstream change is caught before event day.

> **Do not bump these.** AI assistants are explicitly forbidden from changing
> `@copilotkit/*` versions in `AGENTS.md`. The pre-commit hook rejects drift.

## LLM provider

| Field | Value |
|---|---|
| Provider | Google Gemini |
| Endpoint | `https://generativelanguage.googleapis.com/v1beta/openai/` |
| Model ID | **`gemini-2.5-flash`** |
| Env var | `GEMINI_API_KEY` |
| Free-tier key | https://aistudio.google.com/apikey |
| Verified via | `scripts/probe-gemini.sh` on 2026-05-28 |
| Probe result | HTTP 200 + tool_calls confirmed, 1704ms |
| Multi-turn verified | Yes — survives `user → assistant(tool_call) → tool → assistant(reply)` cleanly |

### Why this default (and why NOT 3.5 Flash)

1. **Agentic-tuned.** Google positions Gemini Flash as the agentic flagship.
2. **Sponsor alignment.** Google is the venue + platform sponsor.
3. **Free tier.** No credit card required.
4. **Zero code rewrite.** OpenAI-compat endpoint works with existing `ChatOpenAI`.
5. **Multi-turn compatible with `langchain-openai`.** This is the load-bearing one.

#### The Gemini 3.5 Flash trap

`gemini-3.5-flash` 200s on a single-turn tool-calling probe but **400s on the
follow-up turn** with:

```
Function call is missing a thought_signature in functionCall parts.
This is required for tools to work correctly … Please refer to
https://ai.google.dev/gemini-api/docs/thought-signatures
```

Gemini 3.x emits "thought signatures" with every tool call and requires the
client to replay them on subsequent turns. `langchain-openai 1.1.9` does not
implement this — it strips thought metadata. `reasoning_effort: "none"` does
NOT disable the requirement.

**Upgrade path to 3.5 Flash:** wait until langchain-openai (or another OpenAI-
compatible client) ships thought_signature passthrough, OR switch the agent
to `langchain-google-genai` for native Gemini multi-turn handling. Neither is
in scope for the hackathon starter. CI should re-run the multi-turn probe
nightly so the day langchain-openai gains support, we can flip the default.

### Models that 404'd in the probe (do not use)

- `gemini-3.0-flash`
- `gemini-2.5-flash-latest`
- `gemini-2.0-flash`, `gemini-2.0-flash-001`
- `gemini-1.5-flash`, `gemini-1.5-flash-latest`

### Free-tier rate-limit behavior

Measured 2026-05-28 against `gemini-2.5-flash` via the OpenAI-compat endpoint
with a single API key. Tool see `scripts/load-test-gemini.py`.

| Concurrency | Successes | Failures | p50 (ms) | p95 (ms) | p99 (ms) | Wall (ms) | Retry-After |
|---|---|---|---|---|---|---|---|
| 30 | 30 / 30 | 0 | 1707 | 2027 | 2104 | 2315 | none |
| 100 | 100 / 100 | 0 | 1883 | 2314 | 2817 | 2973 | none |

Single-key cliff is well above 100 concurrent agentic tool-calling requests.
At London-hackathon scale (~30 teams × per-team API keys + a small mentor
fallback pool), this is comfortable headroom. PLAN.md's three rate-limit
mitigations (per-team keys via prereq email, mentor fallback pool, `OFFLINE=1`
insurance) are sufficient; we do NOT need to ship a shared key.

> **HACKATHON.md "if you get rate-limited" runbook:** if a `429` ever appears
> in chat, fall back to `OFFLINE=1` for the demo. The envelope inspector still
> shows real A2UI surfaces from `public/offline-envelopes.json`.

## Pinned versions (JavaScript)

| Package | Pin | Notes |
|---|---|---|
| `@copilotkit/react-core` | `1.56.5` (exact) | No caret |
| `@copilotkit/runtime` | `1.56.5` (exact) | No caret |
| `@copilotkit/a2ui-renderer` | `1.56.5` (exact) | No caret |
| `next` | `16.1.6` (exact) | — |
| `react` / `react-dom` | `19.2.4` (exact) | Tightened from caret in A5 |
| `@ag-ui/a2a-middleware` | (added in Workstream B) | — |

## Pinned versions (Python)

| Package | Pin | Notes |
|---|---|---|
| `langchain` | `1.2.15` | — |
| `langgraph` | `1.1.6` | — |
| `langgraph-cli[inmem]` | `0.4.21` | — |
| `langchain-openai` | `1.1.9` | Used for Gemini via OpenAI-compat too |
| `langchain-anthropic` | `1.4.1` | For the Anthropic swap matrix |
| `copilotkit` | `0.1.87` | Python SDK |
| `openai` | `1.109.1` | Transitive (used by langchain-openai) |

`uv.lock` is committed and authoritative.

## Package manager

| Layer | Manager | Lockfile |
|---|---|---|
| JavaScript | pnpm | `pnpm-lock.yaml` (committed) |
| Python | uv | `agent/uv.lock` (committed) |

## Vendoring (Workstream F)

`vendor/` will mirror `@copilotkit/a2ui-renderer` and `copilotkit` (Python) as a
fallback if upstream cuts a breaking release before event day. CI proves the
vendored mirror builds and renders the smoke envelope. Swap procedure documented
in `vendor/README.md`.

_Not yet populated — added in Workstream F._
