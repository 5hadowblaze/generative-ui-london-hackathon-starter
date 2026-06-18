# Rho Signal Room

🏆 **Top 6 Finalist** at the London A2A & A2UI Hackathon  
🎤 **Presented on stage** at Google London CSG

A Generative UI banking support demo built for the London A2A & A2UI Hackathon at Google London CSG on June 13, 2026.

The project turns a normal banking support chat into a live case room. A
customer can ask about a referral, dispute, account closure, or human transfer,
and the agent generates an interactive A2UI surface with case status, agent
handoffs, policy evidence, risk gates, tool-action state, Redis-backed memory,
LinkUp public evidence, and a final customer-safe receipt.

The main demo lives at:

```text
http://localhost:3000/fixed
```

## What This Project Shows

Rho Signal Room is designed for the Generative UI track: the agent does not only
answer with text. It chooses and renders structured UI at runtime.

It is a **hybrid generative system**, not an end-to-end "LLM draws the whole
screen" demo:

- **Gemini 3.5 Flash owns the meaning of each turn.** It classifies the request
  (referral, dispute, account closure, human transfer, or `unknown`), writes a
  conservative Rho-Bank policy rationale and confidence, proposes one safe next
  action, and extracts named entities (e.g. a friend's name, a charge) as
  structured JSON.
- **Deterministic Python owns the layout.** The A2UI component tree, the
  verification gates, the tool-action risk gating, and the integration
  readiness surface are hand-authored and stable. The model only fills slots in
  that layout. This keeps a regulated case room safe and predictable.
- **There is always an offline fallback.** If the live model is missing, times
  out (>8s), or returns invalid JSON, the system falls back to a deterministic
  keyword classifier + canned rationale. The case room is visually identical in
  shape either way, so `pnpm smoke` passes offline with no API key, and a judge
  prompt never renders a wrong room.

The generated case room makes regulated support work visible:

- **Case intake** - Gemini classifies the request as referral, dispute,
  account closure, human transfer, or `unknown` (a safe "here's what I can do"
  room). A `reasoned by Gemini / fallback` badge shows which path drove the turn.
- **Live A2A handoff** - the banking UI can call a server-side A2A personal
  agent and attach the returned response to the case.
- **Agent relay map** - shows the handoff path between user, personal agent,
  customer-service agent, policy retrieval, live A2A, and environment tools.
- **Policy radar** - separates evidence into bank policy, public evidence,
  Redis memory, and agent response lanes.
- **Tool-action boundary** - shows what the agent wants to do, whether it is
  allowed, and why a high-risk action is blocked.
- **Final receipt** - summarizes required tech used, tool status, next safe
  action, and what was not performed.

For example, a debit-card dispute does not immediately expose private
transaction details. The UI first shows that identity verification is required,
that the case is high risk, and that the dispute tool is blocked until the
customer verifies enough factors.

## Hackathon Context

This repo began as the CopilotKit London A2A & A2UI Hackathon starter kit and
was converted into the Rho Signal Room submission.

The hackathon had two relevant tracks:

- **Track 1: A2A Interoperability Challenge** - agent-to-agent coordination
  using the A2A protocol.
- **Track 2: A2UI / Generative UI Challenge** - dynamic applications where an
  autonomous agent generates UI instead of only returning text.

This repository is the Generative UI project. It keeps A2A integration in the
UI through a server-side live handoff, but the separate Track 1 scoring repo is
maintained independently at:

```text
/Users/amirdzakwan/Documents/Google Hackathon/a2a-track1-submission
```

Rho Signal Room uses the hackathon stack directly:

- **A2UI** for declarative UI envelopes.
- **AG-UI** for streaming agent events into the app.
- **CopilotKit** for the chat/runtime integration.
- **LangGraph + FastAPI** for the Python agent backend.
- **Gemini 3.5 Flash** for agent composition.
- **A2A** for the banking agent handoff path.
- **Redis** for case state and memory.
- **LinkUp** for public evidence search.

## Architecture

```text
Customer chat in Next.js
  -> CopilotKit runtime
  -> FastAPI LangGraph banking agent on :8123
  -> Gemini classifies the case + writes policy rationale + extracts fields
       (agent/src/case_reasoner.py — structured JSON only; 8s timeout;
        deterministic keyword fallback if missing/slow/invalid)
  -> deterministic Python composes the A2UI layout and slots the model's
       rationale/confidence/next-action/fields into it
       (agent/src/banking_agent.py generate_case_surface + _components)
  -> A2UI createSurface/updateComponents/updateDataModel events
  -> React renderer paints the case room in the canvas
  -> optional server-side live A2A call to BANKING_A2A_AGENT_URL
  -> optional Redis case memory at case:{contextId}:* (with a "Restored from
       Redis memory" badge on repeat context)
  -> optional LinkUp public evidence (clickable URLs + freshness in PolicyRadar)
```

The split is deliberate: the **LLM owns classification and prose**, the
**deterministic layout owns the rendered structure and safety gates**. This is a
hybrid generative UI, not full end-to-end LLM layout generation. The same
deterministic layout is the offline fallback, so the demo is judge-safe with no
API key.

The scored Track 1 harness path is not routed through this UI. The UI calls A2A
as an enrichment source for the generated case room; the Track 1 agents are
run directly from their own repo for marked A2A scoring.

## Main Routes

- `/fixed` - Rho Signal Room, the primary banking case-room demo.
- `/dynamic` - dynamic A2UI surfaces generated at runtime for exploratory
  answers.
- `/catalog` - the component catalog used by the generated surfaces.
- `/` - case-room landing route.

The current submission focus is `/fixed`.

## Demo Prompts

Use these in `/fixed`:

```text
I want to refer my friend Dana for a Blue Account.
I see a debit card charge I do not recognize.
I want a human agent now.
I lost my card abroad and need emergency cash.   # off-script / unknown
```

Expected behavior:

- Referral cases show a safe next action: collect real friend contact details.
- Dispute cases show a verification-first path and block transaction mutation.
- Human-transfer cases show a capability-first support path before escalation.
- Off-script prompts render the safe `unknown` room ("I can help with disputes,
  account closure, referrals, or escalation") instead of guessing a wrong case.

Use the **Reset case** button to clear the chat and the rendered surface between
scenarios. The `reasoned by Gemini / fallback` badge and the Gemini health dot
show whether the live model or the offline fallback drove the most recent turn.

## Local Setup

Prerequisites:

- Node.js 20+
- pnpm 10+
- Python 3.12+
- uv

Install and run:

```bash
git clone <your-fork-url>
cd generative-ui-london-hackathon-starter
pnpm install

cp .env.example .env
# Set GEMINI_API_KEY and any optional integration keys.

pnpm run doctor
pnpm dev
```

Open:

```text
http://localhost:3000/fixed
```

The normal dev command starts both:

- Next.js on `:3000`
- FastAPI agent backend on `:8123`

If `pnpm` is not available in a local shell, the same services can be started
manually with the project binaries:

```bash
./node_modules/.bin/concurrently \
  "./node_modules/.bin/next dev --turbopack" \
  "./scripts/run-agent.sh" \
  --names ui,agent \
  --prefix-colors blue,green \
  --kill-others
```

## Environment Variables

Required for live agent generation:

```bash
GEMINI_API_KEY=...
```

Optional live integration variables:

```bash
BANKING_A2A_AGENT_URL=http://localhost:9001
LINKUP_API_KEY=...
REDIS_URL=redis://localhost:6379/0
```

With Live A2A enabled, the app should show missing integrations as blocked
rather than pretending that live evidence was used. Turning Live A2A off makes
fixture mode explicit for demo comparison.

Do not commit `.env`, API keys, or banking secrets.

## Verification

Recommended checks before a submission or demo:

```bash
pnpm run doctor
pnpm run typecheck
pnpm run build
cd agent && uv run python -m unittest discover -s tests -v
```

For the local environment used during development, direct TypeScript validation
also works:

```bash
./node_modules/.bin/tsc --noEmit
```

## Key Files

```text
src/app/(pdf)/fixed/page.tsx
src/app/(pdf)/fixed/FixedPageClient.tsx
src/components/pdf-analyst/SurfaceCanvas.tsx
src/a2ui/catalog/definitions.ts
src/a2ui/catalog/renderers.tsx
src/app/(pdf)/pdf-analyst.css
agent/main.py
agent/src/banking_agent.py
agent/src/case_reasoner.py   # hybrid Gemini classifier + policy rationale
agent/src/catalog.py
docs/rho-signal-room.md
docs/DEMO_SCRIPT.md
```

## Why It Matters

Banking support workflows are high-stakes. A plain chatbot response can hide
important control points: identity verification, policy evidence, tool
eligibility, and whether an account action was actually performed.

Rho Signal Room makes those control points visible. The result is a generated
UI that is useful to a customer, inspectable by a reviewer, and safer for
regulated support workflows.

## Attribution

Built from the CopilotKit London A2A & A2UI Hackathon starter.

- A2UI protocol - Google
- AG-UI protocol - AG-UI Protocol working group / CopilotKit
- A2A protocol - Linux Foundation + Google
- CopilotKit - Generative UI runtime and renderer integration
- LinkUp - public evidence search for AI agents
- Redis - agent context and memory
- Gemini - model used for the agent composition path

See also:

- [docs/rho-signal-room.md](docs/rho-signal-room.md)
- [HACKATHON.md](HACKATHON.md)
- [FROZEN.md](FROZEN.md)
- [SUBMITTING.md](SUBMITTING.md)
