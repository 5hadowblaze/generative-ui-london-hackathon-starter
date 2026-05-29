"use client";

/**
 * Legal Contract Review demo route.
 *
 * URL: /other-examples/legal-contract-review
 * Route group: (legal) — provides the legalPaperCatalog + `legal` agent via
 * sibling `src/app/(legal)/layout.tsx`. The route-group convention lets this
 * page coexist with the dashboard at `/` without double-mounting CopilotKit.
 *
 * Behavior:
 *   - Renders a CopilotChat (left) + paper-styled contract surface (right)
 *     reusing `<ExampleLayout>` from the dashboard for the chat-shell affordance.
 *   - On first mount, auto-invokes the agent with a "Review the NDA" prompt
 *     so the demo is wow-on-load. Skip if the agent already has messages
 *     (e.g. user navigated back).
 *   - Sets `data-catalog-style="legal-paper"` on the surface wrapper so the
 *     scoped theme.css rules (warm off-white, serif body) apply without
 *     leaking into the dashboard route.
 *   - Captures protocol- and local-level agent errors (notably the AG-UI
 *     "Message not found" checkpoint blocker — see Plan v5 §8 and
 *     `docs/troubleshooting.md`) and surfaces a friendlier banner inside
 *     the paper surface. Also detects the silent-auto-prompt failure path
 *     where the agent never responds at all (I-5 from the Local Smoke Report).
 *
 * theme.css is imported here so Next.js bundles it for the route.
 */

import { useEffect, useState } from "react";
import {
  CopilotChat,
  useAgent,
  useFrontendTool,
} from "@copilotkit/react-core/v2";

import { ExampleLayout } from "@/components/example-layout";
import { EnvelopeInspector } from "@/components/EnvelopeInspector";

// Side-effect import: registers the scoped paper theme. The rules are gated
// by `[data-catalog-style="legal-paper"]` so they only apply inside this page.
import "../../../../../other-examples/legal-contract-review/catalog/theme.css";

import { LegalErrorBanner } from "./LegalErrorBanner";
import {
  useLegalAgentError,
  type AgentLike,
  type LegalAgentError,
} from "./use-legal-agent-error";

const AGENT_ID = "legal";
const AUTO_PROMPT =
  "Open document 1 — the Master Supply Agreement with Apex Servos — for review. Use review_document(document_id=1) so I can see the risk-flag margin notes and the verdict.";

/**
 * Per-threadId fire-tracking. Module-scoped (not a useRef) so it survives
 * React StrictMode's double-mount AND the `agent` reference change that
 * `useAgent` emits after the first `runAgent` completes — both of which
 * caused the previous useRef-based guard to double-fire (which then
 * triggered I-1, the AG-UI "Message not found" upstream bug; see hook
 * docstring below). The threadId is regenerated per page mount upstream,
 * so each new page load gets a fresh entry; we never double-fire within
 * a single thread.
 */
const AUTO_PROMPT_FIRED_THREADS = new Set<string>();

/**
 * Auto-load the NDA on first mount via a synthetic user message.
 *
 * We use the CopilotChat-shared agent (resolved by agentId+threadId match)
 * — adding a user message + kicking runAgent is equivalent to the user
 * typing the prompt themselves. Arms the silent-timeout watcher so the
 * canvas can surface a hint if the agent never responds (I-5).
 *
 * Why this hook is paranoid about double-fires (I-1 — AG-UI "Message not
 * found"): the `@ag-ui/langgraph` adapter's `prepareStream` reads the
 * LangGraph thread's checkpointed message count and compares it to the
 * client's local message count. When `serverMessages > clientMessages`,
 * the adapter assumes the user is asking to *regenerate* a prior turn and
 * calls `prepareRegenerateStream`, which then tries to resolve the last
 * client user message against the thread's checkpoint history via
 * `getCheckpointByMessage`. If the auto-prompt fires twice on the same
 * thread (StrictMode double-mount, or agent-reference churn after the
 * first runAgent completes), the second call sends a brand-new user
 * message id that is not in any past checkpoint — and the lookup throws
 * "Message not found", which surfaces in the UI as a banner.
 *
 * Pairing this guard with a fresh per-page-load `threadId` (passed in
 * from the caller) is the surgical fix: a clean thread on every mount
 * means there are never more server messages than client messages on
 * the first run, so the regenerate-detection heuristic never trips.
 */
function useAutoReviewNda(threadId: string, armSilentWatcher: () => void) {
  const { agent } = useAgent({ agentId: AGENT_ID, threadId });

  useEffect(() => {
    if (!agent) return;
    if (AUTO_PROMPT_FIRED_THREADS.has(threadId)) return;

    // If the user already has a conversation in flight, don't hijack it.
    const messages =
      (agent as unknown as { messages?: ReadonlyArray<unknown> }).messages ?? [];
    if (messages.length > 0) {
      AUTO_PROMPT_FIRED_THREADS.add(threadId);
      return;
    }

    AUTO_PROMPT_FIRED_THREADS.add(threadId);
    try {
      (
        agent as unknown as {
          addMessage: (m: {
            id: string;
            role: "user";
            content: string;
          }) => void;
        }
      ).addMessage({
        id: `auto-${crypto.randomUUID()}`,
        role: "user",
        content: AUTO_PROMPT,
      });
      void (
        agent as unknown as { runAgent: () => Promise<unknown> }
      ).runAgent();
      // Arm the silent-failure watcher *after* the run kicks. If the agent
      // never responds (silent failure, e.g. error swallowed upstream), the
      // canvas will render a one-line nudge after the timeout.
      armSilentWatcher();
    } catch (err) {
      // If the agent isn't fully wired yet, log and let the user kick it manually.
      // eslint-disable-next-line no-console
      console.warn("[legal-contract-review] auto-review failed:", err);
    }
  }, [agent, threadId, armSilentWatcher]);
}

/**
 * Canvas: the rendered A2UI surface lives inside the CopilotKit-provided
 * renderer (auto-mounted by the provider when the runtime reports a2ui).
 * We host it inside a scoped wrapper so the paper theme applies, and the
 * envelopes streamed by the agent paint themselves into the surface.
 *
 * Error and silent-timeout state are passed in (rather than re-derived) so
 * `useLegalAgentError` is only subscribed once at the page level — this also
 * keeps the canvas decoupled from the agent identity.
 */
function LegalCanvas({
  isRunning,
  error,
  silentTimeout,
  onDismissError,
}: {
  isRunning: boolean;
  error: LegalAgentError | null;
  silentTimeout: boolean;
  onDismissError: () => void;
}) {
  return (
    <div
      data-catalog-style="legal-paper"
      className="lp-shell h-full overflow-y-auto"
    >
      <div className="max-w-3xl mx-auto px-8 py-10">
        {/* Error path (I-4): protocol / wire error from the agent. */}
        {error ? (
          <LegalErrorBanner
            variant="error"
            error={error}
            onDismiss={onDismissError}
          />
        ) : null}

        {/* Silent-failure path (I-5): auto-prompt fired but no response.
            Only show when there's no captured error — the error banner is
            louder and supersedes this hint. */}
        {!error && silentTimeout ? (
          <LegalErrorBanner variant="silent" />
        ) : null}

        {isRunning && (
          <p className="lp-disclaimer text-xs italic opacity-70 mb-4">
            Reviewing contract...
          </p>
        )}
        {/* The actual A2UI surface is mounted by the CopilotKit provider via
            the catalog. The agent's first envelope creates the surface and
            populates it. Until then, render a hint. */}
        <p className="lp-disclaimer text-xs italic opacity-70">
          Demo mode only — not legal advice. Fictional parties and clauses.
        </p>
      </div>
    </div>
  );
}

export default function LegalContractReviewPage() {
  // Fresh threadId per page mount. Pinning a new threadId on every page
  // load is the surgical workaround for I-1 (AG-UI "Message not found"
  // upstream bug — see hook docstring above and Plan v5 §8). A clean
  // thread starts with zero server-side messages, so the AG-UI/LangGraph
  // adapter never enters the regenerate path that fails on a fresh
  // client-side UUID. Lazy `useState` initializer ensures the ID is
  // generated exactly once per mount (not on every render).
  const [threadId] = useState(() => crypto.randomUUID());

  // Resolve the agent once at page level so the error subscription and the
  // auto-prompt hook share the same handle. Pin to our fresh threadId so
  // useAgent + CopilotChat + useAutoReviewNda all agree on which LangGraph
  // thread to operate on.
  const { agent } = useAgent({ agentId: AGENT_ID, threadId });
  // Narrow to the structural subset the error hook reads. Avoids importing
  // `@ag-ui/client` (transitive dep, not declared in package.json) — see
  // the comment in `use-legal-agent-error.tsx`.
  const { error, silentTimeout, dismissError, armSilentWatcher } =
    useLegalAgentError(agent as unknown as AgentLike | undefined);

  useAutoReviewNda(threadId, armSilentWatcher);

  const isRunning =
    (agent as unknown as { isRunning?: boolean } | undefined)?.isRunning ??
    false;

  // Suggestion chip — gives the user an obvious "try this" entry point if the
  // auto-load doesn't kick in (or if they want to try the SaaS sample too).
  useFrontendTool({
    name: "noop_legal_chip",
    description: "Placeholder — never invoked. Suppresses 'no tools' warning.",
    handler: async () => {},
  });

  return (
    <div className="h-full w-full flex flex-row">
      {/* Left + center: chat + paper canvas */}
      <div className="flex-1 min-w-0 h-full">
        <ExampleLayout
          chatContent={
            <CopilotChat
              agentId={AGENT_ID}
              threadId={threadId}
              attachments={{ enabled: false }}
              input={{
                disclaimer: () => null,
                className: "pb-6",
              }}
            />
          }
          appContent={
            <LegalCanvas
              isRunning={isRunning}
              error={error}
              silentTimeout={silentTimeout}
              onDismissError={dismissError}
            />
          }
        />
      </div>

      {/* Right rail: envelope inspector — same affordance as the dashboard so
          judges can see the wire. Hidden below lg breakpoint to keep mobile usable. */}
      <aside
        className="hidden lg:flex h-full shrink-0"
        style={{ width: 380 }}
        aria-label="A2UI envelope inspector"
      >
        <EnvelopeInspector />
      </aside>
    </div>
  );
}
