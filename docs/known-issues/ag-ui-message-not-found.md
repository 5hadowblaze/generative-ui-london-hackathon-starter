# AG-UI "Message not found" on sub-repo agents (I-1)

**Status:** Fixed on the `legal` agent route in this repo via a per-mount
`threadId` pin. Upstream bug remains. See
[`UPSTREAM-ISSUE-DRAFT.md`](./UPSTREAM-ISSUE-DRAFT.md) for the report to file
against `@ag-ui/langgraph`.

## Symptom

Every legal-agent invocation on `/other-examples/legal-contract-review`
reproduced this client-side error:

```
[CopilotKit] Agent error: Message not found
  Code: agent_run_error_event
  Stack: Error: Message not found
    at Object.onRunErrorEvent (@copilotkit/core/dist/index.mjs:2180:48)
    at @ag-ui/client/dist/index.mjs:570:73
    at j (@ag-ui/client/dist/index.mjs:115:23)
    at async @ag-ui/client/dist/index.mjs:570:26
```

Network shows the run POST succeeds (`POST /api/copilotkit/agent/legal/run`
→ 200 OK), the legal langgraph on `:8124` successfully calls Gemini (200 OK
upstream), but the AG-UI streaming subscriber rejects the response. The
top-level `default` agent on `:8123` was unaffected, ruling out a pure
upstream bug — the failure was configuration-shaped.

## Root cause

The error is thrown by `getCheckpointByMessage` in `@ag-ui/langgraph`
v0.0.31 (file: `dist/index.mjs`, line ~5):

```js
async getCheckpointByMessage(e, t, n) {
  let r = n?.checkpoint_id ? {checkpoint: {checkpoint_id: n.checkpoint_id}} : void 0;
  let i = [...await this.client.threads.getHistory(t, r)].reverse();
  let a = i.find(t => t.values.messages?.some(t => t.id === e));
  if (!a) throw Error(`Message not found`);
  // ...recurse if there are messages AFTER the lookup target...
}
```

This is the regenerate path. It's called from `prepareStream` when the
adapter detects more messages on the server (the LangGraph thread state)
than the client sent:

```js
// from prepareStream:
if (_.filter(e => e.type !== `system`).length > s.filter(e => e.role !== `system`).length) {
  // Assume regenerate. Find the last user message client-side, look it up server-side.
  let t = null;
  for (let e = s.length - 1; e >= 0; e--) {
    if (s[e].role === `user`) { t = g([s[e]])[0]; break; }
  }
  return t
    ? this.prepareRegenerateStream({...e, messageCheckpoint: t}, n)
    : this.subscriber.error(`No user message found in messages to regenerate`);
}
```

The bug surfaces when:

1. The page mounts and the `legal` agent has a stable threadId.
2. The auto-prompt fires once and the LangGraph thread accumulates ~4
   messages (user + AI tool call + tool result + AI response).
3. React StrictMode (Next.js dev default) re-mounts the page, or
   `useAgent` swaps the agent reference after the first run completes,
   and the auto-prompt's previous `useRef`-based guard fails to suppress
   the second invocation.
4. The second `runAgent` sends only the new client-only message to the
   same threadId.
5. The adapter sees `serverMessages (4) > clientMessages (1)` → enters
   `prepareRegenerateStream` → tries to resolve the second message's
   client-minted UUID against the LangGraph thread's checkpoint history.
6. The id isn't in any past checkpoint → `Message not found`.

## Why only this repo's `legal` agent

The top-level `default` agent on `:8123` doesn't use an auto-prompt-on-mount
pattern; the user always types into the chat input first, so the
client-side message count always matches the server-side state.

Two same-process LangGraph dev servers (`:8123` for sample_agent, `:8124`
for legal_review_agent) are equally affected by the adapter heuristic; the
configuration delta that exposes the bug is purely client-side.

## Fix landed

`src/app/(legal)/other-examples/legal-contract-review/page.tsx`:

1. Generate a fresh `threadId` via `useState(() => crypto.randomUUID())`
   on every page mount.
2. Pass it to all three places that resolve the agent:
   `useAgent({agentId: 'legal', threadId})` at page level + inside the
   auto-prompt hook, and `<CopilotChat threadId={threadId} ... />`.
3. Replace the `useRef`-based double-fire guard with a module-scoped
   `Set<string>` keyed on the threadId, so it survives StrictMode mounts
   and `useAgent` agent-reference churn.

A clean threadId on every page load means the LangGraph thread starts
empty, so the adapter never sees more server messages than client messages
and never enters `prepareRegenerateStream`.

## Trade-offs

- Conversation history doesn't survive page reloads on this route. For a
  hackathon demo, that's the desired behaviour anyway — the auto-prompt
  is meant to re-fire as a wow-on-load.
- The fix doesn't address the upstream adapter's overeager regenerate
  detection. If a user manually clicks a chip that fires the same prompt
  twice without typing in between, the adapter heuristic could still
  trip. We haven't seen that path reproduce in practice because the user
  flow always involves typing new content.

## What an upstream fix would look like

`prepareRegenerateStream` should not be invoked unless the client
explicitly signals an intent to regenerate. The current heuristic
(`serverMessages > clientMessages` → assume regenerate) is too lossy:
it conflates "user pruned local state" with "user asked to redo the
prior turn." A safer API would either:

- Accept an explicit `mode: 'regenerate' | 'continue'` parameter on
  `runAgent`, defaulting to `continue`.
- Detect regenerate only when the last client message's `id` matches an
  existing server-side message in the most recent checkpoint (i.e., the
  client is *re-sending* a known message), not just when counts differ.

See [`UPSTREAM-ISSUE-DRAFT.md`](./UPSTREAM-ISSUE-DRAFT.md) for the report.
