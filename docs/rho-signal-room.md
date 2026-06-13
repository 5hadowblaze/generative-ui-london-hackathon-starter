# Rho Signal Room

Rho Signal Room is the mixed-track submission shell:

- Track 1 remains the A2A banking agent pair from `a2a-hackathon-template`.
- Track 2 runs in this Next.js/CopilotKit/AG-UI/A2UI starter.
- The UI agent renders generated banking case rooms and defaults to live A2A
  enrichment when a banking personal agent URL is configured.
- Live A2A mode is strict submission mode: A2A, Redis, and LinkUp must be
  configured and reachable, or the generated case room shows blocked
  integration readiness rather than fallback evidence.

## Architecture

```text
Next.js / CopilotKit chat
  -> /api/copilotkit-pdf
  -> FastAPI /banking LangGraph agent
  -> A2UI createSurface/updateComponents/updateDataModel
  -> live-A2A switch (on by default)
  -> BANKING_A2A_AGENT_URL message/send call when configured
  -> Redis case:{contextId}:* state
  -> LinkUp public-source evidence
```

The scored Track 1 harness path is not routed through the UI. For marked A2A
runs, use the banking template's required services directly:

- `personal-agent` on `:9001`
- `cs-agent` on `:9002`
- `redis`
- dynamic env tools fetched by `contextId`
- model `gemini-3.5-flash`

## Local Track 2 Demo

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000/fixed`.

Useful prompts:

```text
I want to refer my friend Dana for a Blue Account.
I see a card charge I don't recognize. Can you help me dispute it?
I want a human agent now.
```

The **Live A2A** switch in the case-intake panel is on by default. With the
switch on, the next case run must actually use the required integrations:

- `BANKING_A2A_AGENT_URL` for server-side A2A `message/send`
- `REDIS_URL` for case state persistence
- `LINKUP_API_KEY` for live public evidence

If any of those are missing or unreachable, the generated A2UI surface blocks
on integration readiness. Turning the switch off forces deterministic fixtures
for that run and makes it explicit that the run is not using live submission
integrations.

## Required Integrations For Judging

Add these to `.env` / `agent/.env` before judging:

```bash
BANKING_A2A_AGENT_URL=http://localhost:9001
LINKUP_API_KEY=...
REDIS_URL=redis://localhost:6379/0
```

`BANKING_A2A_AGENT_URL` must point at an A2A banking personal agent. The
orchestrator discovers `/.well-known/agent.json` or
`/.well-known/agent-card.json`, sends JSON-RPC `message/send`, preserves the
case `contextId`, and renders the extracted final response as policy evidence.

LinkUp is used only for public/current evidence panels. Rho-Bank policy and
private account data remain bounded to the bank KB and the A2A env API.

Redis stores case state under:

```text
case:{contextId}:summary
case:{contextId}:agent_events
case:{contextId}:tool_calls
case:{contextId}:policy_evidence
case:{contextId}:a2ui_state
```

## Verification

Track 2:

```bash
pnpm doctor
pnpm typecheck
pnpm smoke
pnpm build
```

Track 1, from `../a2a-hackathon-template`:

```bash
docker compose up --build
```

Then from `../a2a-hackathon`:

```bash
uv run a2a-hack smoke \
  --personal-url http://localhost:9001 \
  --cs-url http://localhost:9002
```

If port `8090` is already occupied by a training run, do not run another smoke
against the same agents. Start an isolated pair on alternate ports and point
both agents plus the harness at the same alternate env API port.

## Submission Notes

- Do not commit `.env` or API keys.
- Submit the public repo URL through the hackathon flow.
- Submit the Vertex/Gemini key through the hackathon site, not in code.
- Keep the A2A template contract intact for Track 1 scoring.
