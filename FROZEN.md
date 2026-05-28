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
| Model ID | `gemini-3.5-flash` |
| Env var | `GEMINI_API_KEY` |
| Free-tier key | https://aistudio.google.com/apikey |
| Verified via | `scripts/probe-gemini.sh` on 2026-05-28 |
| Probe result | HTTP 200 + tool_calls confirmed, 1629ms |
| Backup | `gemini-2.5-flash` (also 200 + tool_calls, 1704ms) |

### Why this default

1. **Agentic-tuned.** Google positions Gemini 3.5 Flash as the agentic flagship.
2. **Sponsor alignment.** Google is the venue + platform sponsor.
3. **Free tier.** No credit card required.
4. **Zero code rewrite.** OpenAI-compat endpoint works with existing `ChatOpenAI`.

### Models that 404'd in the probe (do not use)

- `gemini-3.0-flash`
- `gemini-2.5-flash-latest`
- `gemini-2.0-flash`, `gemini-2.0-flash-001`
- `gemini-1.5-flash`, `gemini-1.5-flash-latest`

### Free-tier rate-limit behavior

_TBD — see Workstream A task A7. Will document observed cliff (HTTP status,
retry-after header, time-to-recovery) and the "if you get rate-limited" runbook
in HACKATHON.md once the 30-parallel load test runs._

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
