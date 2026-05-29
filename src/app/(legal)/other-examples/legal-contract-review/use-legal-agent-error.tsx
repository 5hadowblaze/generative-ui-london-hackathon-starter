"use client";

/**
 * Legal-agent error + silent-failure observer.
 *
 * Subscribes to the legal agent's run lifecycle via `agent.subscribe()` (the
 * lower-level AG-UI hook surfaced by `useAgent`). Two error paths are
 * captured so the demo can fail gracefully when the upstream AG-UI checkpoint
 * blocker fires (see `docs/troubleshooting.md` § "AG-UI 'Message not found'"
 * and Plan v5 §8 for the full story):
 *
 *   1. `onRunErrorEvent` — protocol-level `RUN_ERROR` events. This is the
 *      path that fires today for the legal example: the agent's first run
 *      emits `{ message: "Message not found" }` before any envelope arrives.
 *   2. `onRunFailed` — local exceptions (e.g. fetch errors, malformed
 *      payloads). Caught separately so we can distinguish wire faults from
 *      protocol errors in the surfaced UI if we ever want to.
 *
 * Silent-failure detection (I-5): the auto-review path may fire `runAgent()`
 * and never receive a response (the error is swallowed before
 * `onRunErrorEvent` reaches us, or the agent simply never responds). The
 * caller can arm a watcher via `armSilentWatcher()` after kicking the run.
 * If no agent message arrives within `SILENT_TIMEOUT_MS`, we surface a
 * silent-timeout flag so the canvas can render a one-line hint.
 *
 * Pattern: the hook owns its own state, but the silent-watcher is *armed*
 * by the caller — that keeps auto-vs-manual prompt paths from accidentally
 * racing each other. Manual prompts (the user typing in chat) don't arm
 * the watcher because their typical flow is "user kicks, sees nothing,
 * tries again" — they don't need an automated nudge.
 */

import { useCallback, useEffect, useRef, useState } from "react";

/** How long to wait for the first agent message after kicking the auto-run. */
const SILENT_TIMEOUT_MS = 8_000;

/**
 * Structural shape of the subset of the AG-UI `AgentLike` API this hook
 * touches. We intentionally don't import the type from `@ag-ui/client` —
 * that package is only a transitive dep here, and adding it to
 * `package.json` would risk drifting from `FROZEN.md`. The structural type
 * gives us full IntelliSense without a new direct dep.
 */
export interface AgentLike {
  messages?: ReadonlyArray<unknown>;
  subscribe: (subscriber: {
    onRunErrorEvent?: (params: {
      event: { message?: string; code?: string };
    }) => void | unknown;
    onRunFailed?: (params: { error?: { message?: string } }) => void | unknown;
    onRunInitialized?: (params: unknown) => void | unknown;
  }) => { unsubscribe: () => void };
}

export interface LegalAgentError {
  /** Plain-language message from the agent's error event. */
  message: string;
  /** Optional protocol code (e.g. "NOT_FOUND"). May be undefined. */
  code?: string;
  /** Which lifecycle hook caught this — useful for the surfaced UI. */
  source: "run_error_event" | "run_failed";
}

export interface UseLegalAgentErrorResult {
  /** Latest captured error, or null if the run is healthy. */
  error: LegalAgentError | null;
  /**
   * True iff the auto-prompt watcher was armed and SILENT_TIMEOUT_MS
   * elapsed without the agent emitting any messages. Distinct from `error`
   * because the silent-failure path is its own UX affordance — the user
   * never sees an error, just an empty screen.
   */
  silentTimeout: boolean;
  /** Dismiss the captured error (e.g. when the user clicks retry). */
  dismissError: () => void;
  /**
   * Start the silent-timeout watcher. Caller invokes this right after
   * `runAgent()` returns / is kicked. The watcher resolves at the first of:
   *   - `SILENT_TIMEOUT_MS` elapses with `messages.length === 0`
   *   - An error fires (the error path supersedes the silent path)
   *   - A message arrives (clears the timer)
   */
  armSilentWatcher: () => void;
}

/**
 * @param agent  The agent instance returned by `useAgent({ agentId })`.
 *               May be `undefined` on first render before the provider
 *               resolves it — the hook no-ops until it's ready.
 */
export function useLegalAgentError(
  agent: AgentLike | undefined,
): UseLegalAgentErrorResult {
  const [error, setError] = useState<LegalAgentError | null>(null);
  const [silentTimeout, setSilentTimeout] = useState(false);

  // Refs so the silent watcher can read the latest values without forcing
  // a re-subscribe on every render.
  const agentRef = useRef<AgentLike | undefined>(agent);
  const errorRef = useRef<LegalAgentError | null>(error);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  agentRef.current = agent;
  errorRef.current = error;

  const dismissError = useCallback(() => {
    setError(null);
  }, []);

  const armSilentWatcher = useCallback(() => {
    // Cancel any prior watcher — we only ever want one in flight.
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    // Already errored? The error UI supersedes the silent UI, skip.
    if (errorRef.current !== null) return;

    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      const liveAgent = agentRef.current;
      const liveMessages = liveAgent?.messages ?? [];
      // If we have any messages by now, the agent responded — don't surface
      // a false-positive silent timeout.
      if (liveMessages.length === 0 && errorRef.current === null) {
        setSilentTimeout(true);
      }
    }, SILENT_TIMEOUT_MS);
  }, []);

  // Subscribe to the agent's lifecycle once per (agent identity, threadId).
  useEffect(() => {
    if (!agent) return;

    const subscription = agent.subscribe({
      onRunErrorEvent: ({ event }) => {
        const next: LegalAgentError = {
          message: event.message || "The agent run failed.",
          code: event.code,
          source: "run_error_event",
        };
        setError(next);
        // Errored runs cancel the silent watcher — the error UI is louder
        // and more informative than the silent hint.
        if (timerRef.current !== null) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
      },
      onRunFailed: ({ error: runError }) => {
        const next: LegalAgentError = {
          message: runError?.message || "The agent run failed.",
          source: "run_failed",
        };
        setError(next);
        if (timerRef.current !== null) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
      },
      onRunInitialized: () => {
        // A fresh run clears prior silent-timeout state. We deliberately
        // do NOT clear `error` here — the user might still want to see
        // the prior failure context until they explicitly dismiss it (or
        // navigate away).
        setSilentTimeout(false);
      },
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [agent]);

  // Cleanup any pending timer on unmount.
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  return { error, silentTimeout, dismissError, armSilentWatcher };
}
