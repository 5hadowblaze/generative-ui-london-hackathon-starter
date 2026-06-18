# Rho Signal Room — 2–3 minute run-of-show

A tight demo script for the `/fixed` banking case-room. Total run ~2.5 minutes.
Everything below works **offline** (deterministic fallback); with local keys set
it shows the live integrations. Reset between scenarios with the **Reset case**
button (top-right, and beside the case-intake header).

## Before you start (15s)

- Run `pnpm dev`, open `http://localhost:3000/fixed`.
- For the full live demo, set `GEMINI_API_KEY`, `LINKUP_API_KEY`, `REDIS_URL`,
  and `BANKING_A2A_AGENT_URL` in `agent/.env`. Leave **Live A2A on**.
- Point at the **Health strip** (A2A · Redis · LinkUp · Gemini). Explain the
  dots reflect real server-side readiness, validated per run — nothing is faked.

## Beat 1 — Hybrid classification + policy rationale (40s)

1. Type: **"I see a debit card charge I do not recognize."**
2. Point at the header badges: the case is classified **dispute**, and a
   **`reasoned by Gemini`** badge shows the live model drove the turn (the
   Gemini health dot flips to **live**).
3. Read the **Reasoned by Gemini** callout — a conservative, verification-first
   policy rationale that Gemini wrote, slotted into a deterministic layout.
4. Key line: *"The model decides the meaning of the request; the layout and the
   safety gates are deterministic. That's why the dispute tool is **blocked**
   until identity is verified — the LLM can't talk us past a regulated gate."*

## Beat 2 — LinkUp live evidence (25s)

1. Scroll to **Policy radar → Public evidence** lane.
2. Point at the **LinkUp** provenance chip and the **`live` / `fetched Xs ago`**
   freshness badge on each source, and click a source title — it opens the real
   public URL in a new tab.
3. Key line: *"This evidence is fetched live from LinkUp at request time, with a
   visible freshness stamp. With no key, we honestly say 'no live evidence' — we
   never fabricate sources."*

## Beat 3 — Animated A2A relay handoff (20s)

1. Point at the **Agent relay** map. The edge into the currently active agent
   **pulses** with a dot travelling along the path; completed handoffs settle;
   the tool boundary shows **blocked**.
2. Key line: *"CSS-only animation driven by the real A2A handoff state — the
   personal→CS handoff is live; the env-tool boundary stays blocked."*

## Beat 4 — Redis rehydration (the refresh beat) (20s)

1. With `REDIS_URL` set, **refresh the page** (or Reset, then re-send the same
   dispute prompt — same `contextId`).
2. On the second run a green **"Restored from Redis memory"** callout appears,
   naming the previous stage and how long ago it was stored.
3. Key line: *"Case state persists in Redis under `case:{contextId}:*`. The
   second time we touch this context, the room is rehydrated — and we only claim
   that when it actually happened."*

## Beat 5 — Off-script resilience (25s)

1. Click **Reset case**.
2. Type something off-script: **"I lost my card abroad and need emergency
   cash."**
3. It renders the safe **`unknown`** room: *"I can help with disputes, account
   closure, referrals, or escalation."* — no wrong room, no invented action.
4. (Optional) Kill the network / unset the key and re-send a known prompt: the
   badge flips to **`reasoned by fallback`**, the Gemini dot reads **off**, and
   the room is identical in shape. Key line: *"Judge-safe: if the model is gone,
   the deterministic fallback renders the same surface."*

## Close (15s)

- Recap the four sponsor integrations visibly live on screen: **Gemini**
  (reasoned-by badge + rationale), **LinkUp** (live URLs + freshness),
  **Redis** (rehydration badge), **A2A** (animated relay + live transcript).
- Recap the thesis: *"A hybrid generative UI — the LLM owns judgement, the
  deterministic layout owns safety — so it's both impressive and trustworthy for
  regulated banking support."*

## Fallback if something breaks

- No keys at all? The whole flow still runs on the deterministic fallback; just
  narrate the badges reading `fallback` / `off`. `pnpm smoke` proves this path.
- Live A2A slow? Toggle **Live A2A off** to enter explicit fixture mode for
  comparison, then back on.
