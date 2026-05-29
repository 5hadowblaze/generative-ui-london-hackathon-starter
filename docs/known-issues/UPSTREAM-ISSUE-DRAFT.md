# Upstream issue draft: `Message not found` from `getCheckpointByMessage` when client message count is below server message count

**Target repo:** https://github.com/CopilotKit/CopilotKit/issues or
https://github.com/ag-ui-protocol/ag-ui/issues (the
`@ag-ui/langgraph` package source)

**Affected versions**

- `@copilotkit/runtime` 1.56.5
- `@copilotkit/core` 1.56.5
- `@copilotkit/react-core` 1.56.5 (v2 API)
- `@ag-ui/client` 0.0.53
- `@ag-ui/langgraph` 0.0.31

## Title

`@ag-ui/langgraph`: `prepareStream` enters regenerate path and throws
"Message not found" when client message history is shorter than
LangGraph thread state on a fresh user message

## Summary

The `LangGraphAgent.prepareStream` method (in `@ag-ui/langgraph`
`dist/index.mjs`) uses the heuristic
`serverMessages > clientMessages` to detect a "regenerate previous turn"
request. When the heuristic trips, it calls `prepareRegenerateStream`,
which looks up the last client user message in the LangGraph thread's
checkpoint history via `getCheckpointByMessage` and throws
`Error("Message not found")` if the lookup fails.

In practice this heuristic also trips on a legitimate new user message
when the client pruned its local message state but reused the same
threadId. The result is that every subsequent run on the same thread
fails with the unhelpful "Message not found" error after the first run
populates the LangGraph thread state.

## Stack trace

```
[CopilotKit] Agent error: Message not found
  Code: agent_run_error_event
  Stack: Error: Message not found
    at Object.onRunErrorEvent (.../@copilotkit/core/dist/index.mjs:2180:48)
    at .../@ag-ui/client/dist/index.mjs:570:73
    at j (.../@ag-ui/client/dist/index.mjs:115:23)
    at async .../@ag-ui/client/dist/index.mjs:570:26
```

The throw site is `getCheckpointByMessage` in
`@ag-ui/langgraph@0.0.31/dist/index.mjs`, called by
`prepareRegenerateStream`, called by `prepareStream`.

## Repro

1. Two LangGraph dev processes:
   - `:8123` running `sample_agent` (top-level)
   - `:8124` running `legal_review_agent` (sub-repo, but the topology is
     not the issue — see below)
2. Next.js 16 + CopilotKit v2 React provider with two route groups, each
   pinning a different agent:
   ```tsx
   // src/app/(legal)/layout.tsx
   <CopilotKit
     runtimeUrl="/api/copilotkit"
     agent="legal"
     a2ui={{ catalog: legalPaperCatalog }}
     openGenerativeUI={{}}
     useSingleEndpoint={false}
   >
     {children}
   </CopilotKit>
   ```
3. Page-level auto-prompt (a common UX pattern for "wow-on-load" demos):
   ```tsx
   const { agent } = useAgent({ agentId: "legal" });
   useEffect(() => {
     if (!agent || firedRef.current) return;
     firedRef.current = true;
     agent.addMessage({ id: crypto.randomUUID(), role: "user", content: "..." });
     agent.runAgent();
   }, [agent]);
   ```
4. First mount: auto-prompt fires, agent runs, LangGraph thread state on
   `:8124` contains 4 messages (user + AI tool call + tool result + AI
   response).
5. React StrictMode (Next.js dev default) re-mounts the component or
   `useAgent` returns a new agent reference after the first run
   completes. The `firedRef` guard does not survive this because:
   - In StrictMode dev, useRef *is* reset on the second mount.
   - Even outside StrictMode, the `useEffect` re-runs when the `agent`
     reference changes.
6. Auto-prompt's second invocation sends 1 new user message to the same
   threadId. The adapter sees `serverMessages (4) > clientMessages (1)`
   → enters `prepareRegenerateStream` → `Message not found`.

## What the user sees

Every subsequent run on the same thread fails. The agent appears to be
broken even though the run itself completed on the server. The error
banner does not explain the root cause to the user.

## Workaround in the consumer

Force a fresh `threadId` per page mount via `useState(() =>
crypto.randomUUID())`, plumb it through `useAgent({agentId, threadId})`
and `<CopilotChat threadId={...} />`, and replace the `useRef` guard
with a module-scoped `Set<string>` keyed on the threadId. See
`docs/known-issues/ag-ui-message-not-found.md` in this repo for the
exact diff.

This unblocks the demo, but it loses conversation persistence across
reloads — which is the wrong default for production apps that aren't
showing wow-on-load demos.

## Suspected root cause

`prepareStream` (in `dist/index.mjs`):

```js
let _ = h.values.messages ?? [];    // server messages
let v = g(s);                       // client messages converted
// ...
if (_.filter(e => e.type !== `system`).length
    > s.filter(e => e.role !== `system`).length) {
  // assume regenerate
  let t = null;
  for (let e = s.length - 1; e >= 0; e--) {
    if (s[e].role === `user`) { t = g([s[e]])[0]; break; }
  }
  return t
    ? this.prepareRegenerateStream({...e, messageCheckpoint: t}, n)
    : this.subscriber.error(`No user message found in messages to regenerate`);
}
```

The heuristic is too lossy. It conflates two distinct user intents:

| Intent          | client state          | adapter sees           | adapter does       | correct? |
|-----------------|-----------------------|------------------------|--------------------|----------|
| regenerate prev | re-send a known msg   | server > client        | regenerate         | yes      |
| fresh new msg   | client lost old state | server > client        | regenerate (wrong) | no       |

## Proposed fix

1. **Add an explicit mode parameter** to `runAgent` /
   `prepareStream` (e.g. `mode: 'continue' | 'regenerate'`), defaulting
   to `'continue'`. Don't infer regenerate from message counts.
2. **OR** detect regenerate only when the last *client* user message's
   `id` is already present in the *server* message state. That way, a
   fresh client-side UUID never triggers the regenerate path.
3. Update `prepareRegenerateStream` to fail with a more actionable
   error: include the message id it tried to look up, the threadId,
   and a hint about the heuristic.

## Why we hit this and the top-level sample agent doesn't

The top-level `sample_agent` route on this repo doesn't use an
auto-prompt-on-mount pattern; the user always types first, so the
client-side message history accumulates in lockstep with the server
state and the heuristic never trips. The `legal` route uses an
auto-prompt because it's a wow-on-load demo. Any consumer that uses
this pattern will hit the same bug.

## Related local docs

- `docs/known-issues/ag-ui-message-not-found.md` — full repro + fix
  context for this repo.
- `docs/known-issues/snapshot-mode-fallback.md` — sketched fallback
  approach if the upstream fix takes too long to land.
