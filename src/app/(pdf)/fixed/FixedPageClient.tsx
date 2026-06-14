"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CopilotChat,
  useAgent,
  useAgentContext,
} from "@copilotkit/react-core/v2";
import { SiteNav, WorkspaceHeader } from "@/components/pdf-analyst/Brand";
import { SurfaceCanvas, CanvasEmptyState } from "@/components/pdf-analyst/SurfaceCanvas";
import { FilteredUserMessage } from "@/components/pdf-analyst/FilteredUserMessage";
import { FilteredAssistantMessage } from "@/components/pdf-analyst/FilteredAssistantMessage";
import { Split } from "@/components/pdf-analyst/Split";

const AGENT_ID = "banking_agent";
const A2A_STORAGE_KEY = "rho.liveA2A";
const SCENARIOS = [
  {
    id: "referral",
    label: "Referral",
    nextStep:
      "Prepares a vulnerable-customer referral case with policy evidence, approval state, and a customer-safe receipt.",
    detail:
      "No account movement is performed from this chip. It only sends an intake prompt for the agent to build the audit room and propose gated next steps.",
    prompt:
      "Open a referral case for a vulnerable customer who needs help moving to a safer account. Keep Live A2A strict and show the policy, tool approval, and final receipt gates.",
  },
  {
    id: "dispute",
    label: "Dispute",
    nextStep:
      "Starts a card-dispute intake with verification gates, public policy evidence, case memory, and final receipt framing.",
    detail:
      "The scenario request does not file a real dispute or contact a bank. It asks the demo agent to render the controlled case workflow.",
    prompt:
      "I see a debit card charge I do not recognize. Open a dispute case with strict Live A2A verification, LinkUp policy evidence, Redis case memory, and a final receipt.",
  },
  {
    id: "human-transfer",
    label: "Human transfer",
    nextStep:
      "Builds an escalation room showing handoff reason, evidence requirements, approval state, and safe transfer language.",
    detail:
      "The chip does not transfer the customer. It sends a simulation prompt so the agent can prepare the handoff checklist and receipt.",
    prompt:
      "Escalate this banking support case to a human specialist. Show the handoff reason, required evidence, tool approval state, and final customer-safe receipt without revealing hidden reasoning.",
  },
] as const;

type HealthState = "live" | "off" | "blocked";
export type HealthCheck = {
  name: "A2A" | "Redis" | "LinkUp" | "Gemini";
  status: HealthState;
  message: string;
};

export default function FixedPageClient({
  initialHealthChecks,
}: {
  initialHealthChecks: HealthCheck[] | null;
}) {
  const { agent } = useAgent({ agentId: AGENT_ID });
  const [liveA2A, setLiveA2A] = useState(() => {
    if (typeof window === "undefined") return true;
    const saved = window.localStorage.getItem(A2A_STORAGE_KEY);
    return saved !== "off";
  });

  useEffect(() => {
    window.localStorage.setItem(A2A_STORAGE_KEY, liveA2A ? "on" : "off");
  }, [liveA2A]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest(
        "[data-rho-live-toggle]",
      ) as HTMLButtonElement | null;
      if (!button) return;
      setLiveA2A(button.dataset.enabled !== "true");
    };
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, []);

  useAgentContext({
    description: "Rho Signal Room live A2A mode",
    value: {
      a2aEnabled: liveA2A,
    },
  });

  const runScenario = useCallback(
    (prompt: string) => {
      if (!agent || agent.isRunning) return;
      agent.addMessage({
        role: "user",
        id: crypto.randomUUID(),
        content: prompt,
      });
      void agent.runAgent();
    },
    [agent],
  );

  return (
    <div className="h-screen flex flex-col bg-[var(--bg)]">
      <SiteNav active="fixed" />
      <WorkspaceHeader
        eyebrow="Banking case room"
        title="Rho Signal Room"
        agentId={AGENT_ID}
        status={
          <div className="hidden md:flex items-center gap-2 text-[12px] text-[var(--ink)]">
            <span className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 py-1 mono text-[10.5px]">
              hybrid demo
            </span>
            <LiveA2AToggle enabled={liveA2A} compact />
          </div>
        }
      />
      <IntegrationHealthStrip
        liveA2A={liveA2A}
        initialChecks={initialHealthChecks}
      />

      <div className="flex-1 min-h-0 flex">
        <Split
          persistKey="fixed.split"
          initialLeftFraction={0.3}
          left={
            <div className="h-full flex flex-col copilot-chat-wrapper">
              <div className="shrink-0 border-b border-[var(--line)] bg-[var(--surface)] px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[13px] font-semibold text-[var(--ink)]">
                      Case intake
                    </div>
                    <div className="mt-1 text-[12.5px] leading-snug text-[var(--ink-2)]">
                      Disputes, account closure, referrals, and escalations
                      generate their own audit room with policy and tool gates.
                    </div>
                  </div>
                  <LiveA2AToggle enabled={liveA2A} />
                </div>
              </div>
              <ScenarioChips
                disabled={!agent || agent.isRunning}
                onSelect={runScenario}
              />
              <div className="flex-1 min-h-0">
                <CopilotChat
                  agentId={AGENT_ID}
                  chatView={{
                    messageView: {
                      userMessage: FilteredUserMessage,
                      assistantMessage: FilteredAssistantMessage,
                    },
                  }}
                  labels={{
                    chatInputPlaceholder:
                      "Ask for a dispute, account closure, referral, or escalation…",
                    welcomeMessageText:
                      "Ask a banking support question. I’ll generate the audit room, policy evidence, A2A relay, tool approval, and final receipt.",
                  }}
                />
              </div>
            </div>
          }
          right={
            <SurfaceCanvas
              channel={AGENT_ID}
              liveA2A={liveA2A}
              emptyState={
                <CanvasEmptyState
                  title="No case room yet"
                  subtitle="Choose a prompt or type a banking support request. The generated A2UI surface will reshape around verification gates, policy evidence, tool approvals, and the final receipt."
                  hint={
                    <span className="mono text-[11px] text-[var(--ink)]">
                      Try: I see a card charge I don’t recognize
                    </span>
                  }
                />
              }
            />
          }
        />
      </div>
    </div>
  );
}

function IntegrationHealthStrip({
  liveA2A,
  initialChecks,
}: {
  liveA2A: boolean;
  initialChecks: HealthCheck[] | null;
}) {
  const [checks, setChecks] = useState<HealthCheck[]>(() =>
    initialChecks?.length ? initialChecks : buildFallbackHealth(liveA2A),
  );

  useEffect(() => {
    let cancelled = false;
    const fallbackChecks = buildFallbackHealth(liveA2A);

    async function loadHealth() {
      try {
        const response = await fetch(`/api/rho/health?liveA2A=${liveA2A ? "true" : "false"}`, {
          cache: "no-store",
        });
        const payload = (await response.json()) as { checks?: unknown };
        const parsed = parseHealthChecks(payload.checks);
        if (!cancelled && parsed.length) setChecks(parsed);
      } catch {
        if (!cancelled) setChecks(fallbackChecks);
      }
    }

    void loadHealth();
    return () => {
      cancelled = true;
    };
  }, [liveA2A]);

  return (
    <section
      className="shrink-0 border-b border-[var(--line)] bg-[var(--surface)] px-4 py-2"
      aria-label="Integration health"
    >
      <div className="rho-health-strip">
        <span className="rho-health-strip__label mono text-[10.5px] uppercase tracking-[0.12em] text-[var(--muted)]">
          Health
        </span>
        {checks.map((check) => (
          <span
            key={check.name}
            className="rho-health-strip__item"
            data-state={check.status}
            title={`${check.name}: ${check.message}`}
          >
            <span className={healthDotClassName(check.status)} aria-hidden />
            <span>{check.name}</span>
            <span className="mono text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">
              {check.status}
            </span>
          </span>
        ))}
        <span className="rho-health-strip__note hidden text-[11.5px] text-[var(--muted)] lg:inline">
          Server validates secret-backed readiness per run.
        </span>
      </div>
    </section>
  );
}

function buildFallbackHealth(liveA2A: boolean): HealthCheck[] {
  return [
    {
      name: "A2A",
      status: liveA2A ? "blocked" : "off",
      message: liveA2A
        ? "Waiting for server health."
        : "Fixture mode is explicit; no A2A relay is claimed.",
    },
    {
      name: "Redis",
      status: liveA2A ? "blocked" : "off",
      message: liveA2A
        ? "Waiting for server health."
        : "Fixture mode is explicit; no Redis memory is claimed.",
    },
    {
      name: "LinkUp",
      status: liveA2A ? "blocked" : "off",
      message: liveA2A
        ? "Waiting for server health."
        : "Fixture mode is explicit; no public evidence is claimed.",
    },
    {
      name: "Gemini",
      status: "blocked",
      message:
        "Waiting for server health. No API key is exposed to the browser.",
    },
  ];
}

function parseHealthChecks(raw: unknown): HealthCheck[] {
  if (!Array.isArray(raw)) return [];
  const allowedNames = new Set(["A2A", "Redis", "LinkUp", "Gemini"]);
  const allowedStatuses = new Set(["live", "off", "blocked"]);
  return raw
    .map((item): HealthCheck | null => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      if (
        typeof record.name !== "string" ||
        !allowedNames.has(record.name) ||
        typeof record.status !== "string" ||
        !allowedStatuses.has(record.status)
      ) {
        return null;
      }
      return {
        name: record.name as HealthCheck["name"],
        status: record.status as HealthState,
        message:
          typeof record.message === "string"
            ? record.message
            : "No health detail returned.",
      };
    })
    .filter((item): item is HealthCheck => Boolean(item));
}

function ScenarioChips({
  disabled,
  onSelect,
}: {
  disabled: boolean;
  onSelect: (prompt: string) => void;
}) {
  const [selectedId, setSelectedId] =
    useState<(typeof SCENARIOS)[number]["id"]>("dispute");
  const selectedScenario =
    SCENARIOS.find((scenario) => scenario.id === selectedId) ?? SCENARIOS[0];

  return (
    <div className="rho-scenario-chips shrink-0 border-t border-[var(--line)] bg-[var(--surface)] px-4 py-2">
      <div
        className="flex flex-wrap items-center gap-2"
        role="group"
        aria-label="Scenario previews"
      >
        <span className="mono text-[10.5px] uppercase tracking-[0.12em] text-[var(--muted)]">
          Scenario
        </span>
        {SCENARIOS.map((scenario) => (
          <button
            key={scenario.id}
            type="button"
            aria-pressed={selectedScenario.id === scenario.id}
            data-selected={
              selectedScenario.id === scenario.id ? "true" : "false"
            }
            onClick={() => setSelectedId(scenario.id)}
            className={`rho-scenario-chip rounded-md border px-2.5 py-1.5 text-[12px] font-semibold text-[var(--ink)] transition hover:border-[var(--ink-2)] hover:bg-[var(--surface)] focus:outline-none focus:ring-2 focus:ring-[var(--mint)] ${
              selectedScenario.id === scenario.id
                ? "border-[var(--ink)] bg-[var(--surface)]"
                : "border-[var(--line)] bg-[var(--surface-soft)]"
            }`}
          >
            {scenario.label}
          </button>
        ))}
      </div>
      <div className="mt-2 rounded-md border border-[var(--line)] bg-[var(--surface-soft)] p-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-[var(--ink)]">
              {selectedScenario.label}
            </div>
            <p className="mt-1 text-[12.5px] leading-snug text-[var(--ink-2)]">
              {selectedScenario.nextStep}
            </p>
          </div>
          <button
            type="button"
            disabled={disabled}
            aria-label={`Send ${selectedScenario.label} scenario`}
            onClick={() => onSelect(selectedScenario.prompt)}
            className="shrink-0 rounded-md border border-[var(--line)] bg-[var(--ink)] px-3 py-1.5 text-[12px] font-semibold text-[var(--surface)] transition hover:bg-[var(--ink-2)] focus:outline-none focus:ring-2 focus:ring-[var(--mint)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {disabled ? "Running..." : "Send scenario"}
          </button>
        </div>
        <details className="mt-2">
          <summary className="cursor-pointer text-[12px] font-semibold text-[var(--ink)]">
            Next-step detail
          </summary>
          <p className="mt-1 text-[12px] leading-snug text-[var(--ink-2)]">
            {selectedScenario.detail}
          </p>
        </details>
      </div>
    </div>
  );
}

function healthDotClassName(state: HealthState) {
  const base = "h-2 w-2 rounded-full";
  if (state === "live") return `${base} bg-[var(--mint)]`;
  if (state === "off") return `${base} bg-[var(--muted-2)]`;
  return `${base} bg-[var(--orange)]`;
}

function LiveA2AToggle({
  enabled,
  compact = false,
}: {
  enabled: boolean;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      data-rho-live-toggle
      className={
        compact
          ? "rho-a2a-switch rho-a2a-switch--compact"
          : "rho-a2a-switch"
      }
      data-enabled={enabled ? "true" : "false"}
      title="Toggle live server-side A2A enrichment for the next case run"
    >
      <span className="rho-a2a-switch__track" aria-hidden>
        <span className="rho-a2a-switch__thumb" />
      </span>
      <span className="rho-a2a-switch__label">
        {enabled ? "Live A2A on" : "Live A2A off"}
      </span>
    </button>
  );
}
