"use client";

import { useEffect, useRef, useState } from "react";
import {
  A2UIProvider,
  A2UIRenderer,
  useA2UIActions,
} from "@copilotkit/a2ui-renderer";
import { useAgent } from "@copilotkit/react-core/v2";
import { catalog } from "@/a2ui/catalog";
import { surfaceBus } from "@/a2ui/surface-bus";

/* The big workspace pane. A page-level A2UIProvider subscribes to the
 * surface bus so any surface produced by chat renders here at canvas size.
 *
 * Critically, the provider's `onAction` callback forwards every chip / button
 * click in a rendered surface back to the agent as
 *   forwardedProps.a2uiAction.userAction = { name, surfaceId, context, ... }
 * The A2UI middleware on the backend sees this on the next run and injects
 * a `log_a2ui_event` tool result so the agent's reasoning step can react. */
export function SurfaceCanvas({
  channel,
  emptyState,
  liveA2A = false,
  onReasonedBy,
}: {
  channel: string;
  emptyState: React.ReactNode;
  liveA2A?: boolean;
  onReasonedBy?: (value: "Gemini" | "fallback") => void;
}) {
  const { agent } = useAgent({ agentId: channel });
  const isWaitingForA2A = liveA2A && Boolean(agent?.isRunning);

  return (
    <A2UIProvider
      catalog={catalog}
      onAction={(message) => {
        // The agent handle from useAgent may be undefined on the first
        // render(s); bail before dereferencing addMessage/runAgent.
        if (!agent) return;
        console.log(
          `[surface-canvas] chip dispatch channel=${channel}`,
          message,
        );
        // `message` shape: { userAction: { name, surfaceId, context, ... } }
        // 1. Add a visible user message so the chat reflects the click .
        //    otherwise the action travels silently via forwardedProps and
        //    the user sees the agent respond without context.
        // 2. Run the agent with the action carried in forwardedProps so the
        //    A2UI middleware can inject the log_a2ui_event tool result.
        const ua = message?.userAction;
        const labelHint = readContextLabel(ua?.context);
        if (ua?.name) {
          agent.addMessage({
            id: crypto.randomUUID(),
            role: "user",
            content: humanizeAction(ua.name, labelHint),
          });
        }
        void agent
          .runAgent({
            forwardedProps: { a2uiAction: message },
          })
          .then(() =>
            console.log(`[surface-canvas] runAgent resolved for ${channel}`),
          )
          .catch((err) => {
            console.warn("[surface-canvas] runAgent failed", err);
          });
      }}
    >
      <CanvasInner
        channel={channel}
        emptyState={emptyState}
        isWaitingForA2A={isWaitingForA2A}
        liveA2A={liveA2A}
        onReasonedBy={onReasonedBy}
      />
    </A2UIProvider>
  );
}

function CanvasInner({
  channel,
  emptyState,
  isWaitingForA2A,
  liveA2A,
  onReasonedBy,
}: {
  channel: string;
  emptyState: React.ReactNode;
  isWaitingForA2A: boolean;
  liveA2A: boolean;
  onReasonedBy?: (value: "Gemini" | "fallback") => void;
}) {
  const actions = useA2UIActions();
  const [surfaceId, setSurfaceId] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [revealGeneration, setRevealGeneration] = useState(0);
  const [isRevealing, setIsRevealing] = useState(false);
  const [caseContextId, setCaseContextId] = useState<string | null>(null);
  const [fullA2AStatus, setFullA2AStatus] = useState<FullA2AStatus | null>(
    null,
  );
  const seenRef = useRef(0);
  const createdSurfacesRef = useRef<Set<string>>(new Set());

  /* The MessageProcessor THROWS on duplicate createSurface. Each agent call
   * to render_dashboard emits a fresh createSurface + updateComponents +
   * updateDataModel batch. the second batch's createSurface would crash
   * the batch and the data update never lands. Track which surfaceIds
   * we've already created and strip duplicate createSurface ops. */
  function applyOps(
    ops: typeof seenRef extends never ? never : Array<Record<string, unknown>>,
  ) {
    if (!ops.length) return;
    const out = ops.filter((op) => {
      const cs = op.createSurface as { surfaceId?: string } | undefined;
      if (cs?.surfaceId) {
        if (createdSurfacesRef.current.has(cs.surfaceId)) {
          console.log(
            `[surface-canvas] skip duplicate createSurface(${cs.surfaceId})`,
          );
          return false;
        }
        createdSurfacesRef.current.add(cs.surfaceId);
      }
      return true;
    });
    if (!out.length) return;
    console.log(
      `[surface-canvas] processMessages channel=${channel} ` +
        `(${out.length} ops after dedupe, ${ops.length} raw)`,
    );
    try {
      actions.processMessages(out);
      const nextContextId = readCaseContextId(out);
      if (nextContextId) {
        setCaseContextId(nextContextId);
        setFullA2AStatus(null);
      }
      const reasonedBy = readReasonedBy(out);
      if (reasonedBy && onReasonedBy) onReasonedBy(reasonedBy);
      setRevealGeneration((current) => current + 1);
    } catch (err) {
      console.warn("[surface-canvas] processMessages threw:", err);
    }
  }

  useEffect(() => {
    const initial = surfaceBus.snapshot(channel);
    if (initial.ops.length) {
      applyOps(initial.ops as never);
      seenRef.current = initial.ops.length;
      setSurfaceId(initial.surfaceId);
    }
    return surfaceBus.subscribe(channel, (snap) => {
      const tail = snap.ops.slice(seenRef.current);
      console.log(
        `[surface-canvas] bus notify channel=${channel} ` +
          `(snap=${snap.ops.length} seen=${seenRef.current} tail=${tail.length} ` +
          `surfaceId=${snap.surfaceId ?? "null"})`,
      );
      if (tail.length) applyOps(tail as never);
      seenRef.current = snap.ops.length;
      if (snap.surfaceId) setSurfaceId(snap.surfaceId);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actions, channel]);

  useEffect(() => {
    if (!isWaitingForA2A) {
      setElapsedSeconds(0);
      return;
    }
    setElapsedSeconds(0);
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.max(1, Math.floor((Date.now() - startedAt) / 1000)));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isWaitingForA2A]);

  useEffect(() => {
    if (!revealGeneration) return;
    setIsRevealing(false);
    const frame = window.requestAnimationFrame(() => {
      setIsRevealing(true);
    });
    const timer = window.setTimeout(() => {
      setIsRevealing(false);
    }, 1800);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [revealGeneration]);

  useEffect(() => {
    if (!liveA2A || !caseContextId) {
      setFullA2AStatus(null);
      return;
    }
    const contextId = caseContextId;
    let cancelled = false;
    let timer: number | undefined;

    async function poll() {
      try {
        const response = await fetch(
          `/api/rho/full-a2a/${encodeURIComponent(contextId)}`,
          { cache: "no-store" },
        );
        const status = (await response.json()) as FullA2AStatus;
        if (cancelled) return;
        setFullA2AStatus(status);
        if (status.status === "complete" || status.status === "failed") return;
      } catch (error) {
        if (!cancelled) {
          setFullA2AStatus({
            status: "unavailable",
            contextId,
            message:
              error instanceof Error
                ? error.message
                : "Transcript polling failed.",
          });
        }
      }
      if (!cancelled) timer = window.setTimeout(poll, 2500);
    }

    timer = window.setTimeout(poll, 1200);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [caseContextId, liveA2A]);

  if (!surfaceId) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        {isWaitingForA2A ? (
          <A2AWaitingPanel elapsedSeconds={elapsedSeconds} />
        ) : (
          emptyState
        )}
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      {isWaitingForA2A && (
        <div className="p-6 pb-0 md:p-8 md:pb-0">
          <A2AWaitingPanel elapsedSeconds={elapsedSeconds} compact />
        </div>
      )}
      {liveA2A && caseContextId && (
        <div className="px-6 pt-6 md:px-8 md:pt-8">
          <FullA2ATranscriptPanel status={fullA2AStatus} />
        </div>
      )}
      <div
        className="rho-procedural-surface"
        data-revealing={isRevealing ? "true" : "false"}
        data-generation={revealGeneration}
      >
        <div className="a2ui-surface p-6 md:p-8">
          <A2UIRenderer surfaceId={surfaceId} />
        </div>
      </div>
    </div>
  );
}

type FullA2AStatus = {
  status: "running" | "complete" | "failed" | "missing" | "unavailable";
  contextId: string;
  message: string;
  text?: string;
  endpoint?: string;
  elapsedSeconds?: number;
};

function FullA2ATranscriptPanel({
  status,
}: {
  status: FullA2AStatus | null;
}) {
  const state = status?.status ?? "running";
  const isFailed = state === "failed" || state === "unavailable";
  const isComplete = state === "complete";
  const title = isComplete
    ? "Full A2A attached"
    : isFailed
      ? "Full A2A failed"
      : "Full A2A running";
  const events = getFullA2AEvents(status);
  const detailsKey = isComplete ? "complete" : isFailed ? "failed" : "active";
  const [isExpanded, setIsExpanded] = useState(!isComplete);
  const detailsKeyRef = useRef(detailsKey);
  const endpoint = formatSafeEndpoint(status?.endpoint);
  const elapsed =
    typeof status?.elapsedSeconds === "number"
      ? `${status.elapsedSeconds}s`
      : "pending";
  const transcript = status?.text?.trim();

  useEffect(() => {
    if (detailsKeyRef.current === detailsKey) return;
    detailsKeyRef.current = detailsKey;
    setIsExpanded(!isComplete);
  }, [detailsKey, isComplete]);

  return (
    <details
      className="rho-full-a2a"
      data-state={state}
      aria-live="polite"
      open={isExpanded}
      onToggle={(event) => setIsExpanded(event.currentTarget.open)}
    >
      <summary className="rho-full-a2a__header">
        <div>
          <div className="rho-full-a2a__eyebrow">Live A2A handoff</div>
          <h3 className="rho-full-a2a__title">{title}</h3>
        </div>
        <span className="flex items-center gap-2">
          <span className="rho-full-a2a__pill">{state}</span>
          <span className="mono text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">
            {isExpanded ? "Hide details" : "Show details"}
          </span>
        </span>
      </summary>
      <dl className="mt-3 grid gap-2 text-[11.5px] text-[var(--ink)] sm:grid-cols-3">
        <div className="rounded-md border border-[var(--line)] bg-[var(--surface-soft)] px-3 py-2">
          <dt className="mono text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">
            Status
          </dt>
          <dd className="mt-1 font-semibold">{state}</dd>
        </div>
        <div className="rounded-md border border-[var(--line)] bg-[var(--surface-soft)] px-3 py-2">
          <dt className="mono text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">
            Elapsed
          </dt>
          <dd className="mt-1 font-semibold">{elapsed}</dd>
        </div>
        <div className="min-w-0 rounded-md border border-[var(--line)] bg-[var(--surface-soft)] px-3 py-2">
          <dt className="mono text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">
            Endpoint
          </dt>
          <dd className="mt-1 truncate font-semibold" title={endpoint}>
            {endpoint}
          </dd>
        </div>
      </dl>
      <ol className="rho-a2a-wait__steps">
        {events.map((event) => (
          <li
            key={event.label}
            className="rho-a2a-wait__step"
            data-state={event.state}
          >
            <span className="rho-a2a-wait__dot" />
            <span>
              {event.label}
              {event.meta && (
                <span className="rho-full-a2a__meta"> {event.meta}</span>
              )}
            </span>
          </li>
        ))}
      </ol>
      {status?.message && (
        <p className="rho-full-a2a__body">{status.message}</p>
      )}
      {transcript && (
        <details className="mt-3 rounded-md border border-[var(--line)] bg-[var(--surface-soft)] px-3 py-2">
          <summary className="cursor-pointer text-[12px] font-semibold text-[var(--ink)]">
            Full A2A response transcript
          </summary>
          <pre className="rho-full-a2a__transcript">{transcript}</pre>
        </details>
      )}
    </details>
  );
}

type FullA2AEvent = {
  label: string;
  state: "done" | "active" | "pending";
  meta?: string;
};

function getFullA2AEvents(status: FullA2AStatus | null): FullA2AEvent[] {
  const state = status?.status ?? "running";
  const isComplete = state === "complete";
  const isFailed = state === "failed" || state === "unavailable";
  const fullA2AMeta = formatA2AMeta(status);

  return [
    {
      label: "Case rendered",
      state: "done",
    },
    {
      label: "A2A probe complete",
      state: "done",
      meta: status?.endpoint
        ? `endpoint ${formatSafeEndpoint(status.endpoint)}`
        : undefined,
    },
    {
      label: "Full A2A running",
      state: isComplete || isFailed ? "done" : "active",
      meta: !isComplete && !isFailed ? fullA2AMeta : undefined,
    },
    {
      label: isFailed ? "Full A2A failed" : "Full A2A attached",
      state: isComplete ? "done" : isFailed ? "active" : "pending",
      meta: isComplete || isFailed ? fullA2AMeta : undefined,
    },
  ];
}

function formatA2AMeta(status: FullA2AStatus | null): string | undefined {
  const parts: string[] = [];
  if (typeof status?.elapsedSeconds === "number") {
    parts.push(`${status.elapsedSeconds}s`);
  }
  if (status?.endpoint) {
    parts.push(`endpoint ${formatSafeEndpoint(status.endpoint)}`);
  }
  return parts.length ? parts.join(" · ") : undefined;
}

function formatSafeEndpoint(endpoint: string | undefined): string {
  if (!endpoint) return "pending";
  try {
    const base =
      typeof window === "undefined"
        ? "http://localhost"
        : window.location.origin;
    const parsed = new URL(endpoint, base);
    return parsed.origin === base
      ? parsed.pathname
      : `${parsed.origin}${parsed.pathname}`;
  } catch {
    return endpoint.split(/[?#]/)[0] || "provided";
  }
}

function A2AWaitingPanel({
  elapsedSeconds,
  compact = false,
}: {
  elapsedSeconds: number;
  compact?: boolean;
}) {
  const steps = [
    "Resolving the banking agent card",
    "Sending A2A message/send with contextId",
    "Waiting for personal-agent and CS-agent protocol response",
    "Preparing A2UI relay, evidence, and receipt",
  ];
  const activeStep = Math.min(
    steps.length - 1,
    elapsedSeconds < 3 ? 0 : elapsedSeconds < 8 ? 1 : elapsedSeconds < 18 ? 2 : 3,
  );

  return (
    <section
      className={compact ? "rho-a2a-wait rho-a2a-wait--compact" : "rho-a2a-wait"}
      aria-live="polite"
      aria-label="Live A2A progress"
    >
      <div className="rho-a2a-wait__header">
        <div>
          <div className="rho-a2a-wait__eyebrow">Live A2A in progress</div>
          <h2 className="rho-a2a-wait__title">
            Waiting for the banking agents to return
          </h2>
        </div>
        <div className="rho-a2a-wait__timer">{elapsedSeconds}s</div>
      </div>
      <ol className="rho-a2a-wait__steps">
        {steps.map((step, index) => (
          <li
            key={step}
            className="rho-a2a-wait__step"
            data-state={
              index < activeStep ? "done" : index === activeStep ? "active" : "pending"
            }
          >
            <span className="rho-a2a-wait__dot" />
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <p className="rho-a2a-wait__note">
        This can take 15-30 seconds because the UI is waiting for a real A2A
        response before rendering the final case room.
      </p>
    </section>
  );
}

function readContextLabel(ctx: unknown): string | undefined {
  if (!ctx || typeof ctx !== "object") return undefined;
  const c = ctx as Record<string, unknown>;
  const v = c.value ?? c.label;
  return typeof v === "string" ? v : undefined;
}

function readCaseContextId(ops: Array<Record<string, unknown>>): string | null {
  for (const op of ops) {
    const update = op.updateDataModel as
      | {
          data?: {
            case?: {
              contextId?: unknown;
            };
          };
        }
      | undefined;
    const contextId = update?.data?.case?.contextId;
    if (typeof contextId === "string" && contextId) return contextId;
  }
  return null;
}

function readReasonedBy(
  ops: Array<Record<string, unknown>>,
): "Gemini" | "fallback" | null {
  for (const op of ops) {
    const update = op.updateDataModel as
      | { data?: { case?: { summary?: { reasonedBy?: unknown } } } }
      | undefined;
    const reasonedBy = update?.data?.case?.summary?.reasonedBy;
    if (reasonedBy === "Gemini" || reasonedBy === "fallback") return reasonedBy;
  }
  return null;
}

function humanizeAction(name: string, hint?: string): string {
  if (name === "select_chip" && hint) return `Switch scope → ${prettify(hint)}`;
  if (hint) return `${prettify(name)} → ${prettify(hint)}`;
  return prettify(name);
}

function prettify(s: string): string {
  return s
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/(^|\s)\w/g, (m) => m.toUpperCase());
}

export function CanvasEmptyState({
  title,
  subtitle,
  hint,
}: {
  title: string;
  subtitle: string;
  hint?: React.ReactNode;
}) {
  return (
    <div className="max-w-md text-center flex flex-col items-center gap-3">
      <div
        className="w-12 h-12 rounded-[8px] border border-[var(--line)] flex items-center justify-center"
        style={{ background: "var(--surface-soft)" }}
        aria-hidden
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--ink)"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="3" width="7" height="9" rx="1.5" />
          <rect x="14" y="3" width="7" height="5" rx="1.5" />
          <rect x="14" y="12" width="7" height="9" rx="1.5" />
          <rect x="3" y="16" width="7" height="5" rx="1.5" />
        </svg>
      </div>
      <h2 className="text-[20px] font-semibold tracking-tight text-[var(--ink)]">
        {title}
      </h2>
      <p className="text-[14px] text-[var(--ink)] leading-relaxed">
        {subtitle}
      </p>
      {hint && <div className="mt-2">{hint}</div>}
    </div>
  );
}
