/**
 * useEnvelopeStream — captures A2UI envelopes flowing over AG-UI.
 *
 * The agent emits envelopes via ActivityMessages with activityType = "a2ui-surface"
 * and the operations array under `content.a2ui_operations`. We monitor those
 * messages on the agent and turn them into a chronological list of captured
 * envelopes the EnvelopeInspector renders.
 *
 * If `OFFLINE=1` (or no envelopes have been observed and `enableDemoFallback`
 * is true), we seed with a small set of canned envelopes so the inspector
 * renders something out of the box during a cold demo. See public/offline-envelopes.json
 * (owned by workstream E) for the canonical fallback set.
 */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAgent } from "@copilotkit/react-core/v2";

import {
  A2UI_ACTIVITY_TYPE,
  A2UI_OPERATIONS_KEY,
  type A2UIEnvelope,
  type CapturedEnvelope,
  extractSurfaceId,
  inferEnvelopeKind,
} from "@/types/a2ui";

/** Built-in demo envelopes — used when no real envelopes have streamed yet. */
const DEMO_ENVELOPES: A2UIEnvelope[] = [
  {
    version: "v0.9",
    createSurface: {
      surfaceId: "flight-search-results",
      catalogId: "copilotkit://app-dashboard-catalog",
    },
  },
  {
    version: "v0.9",
    updateComponents: {
      surfaceId: "flight-search-results",
      root: {
        id: "root",
        type: "Row",
        properties: {
          gap: 16,
          children: [
            { id: "card-1", basePath: "$.flights[0]" },
            { id: "card-2", basePath: "$.flights[1]" },
          ],
        },
      },
    },
  },
  {
    version: "v0.9",
    updateDataModel: {
      surfaceId: "flight-search-results",
      data: {
        flights: [
          {
            id: "f1",
            airline: "United Airlines",
            flightNumber: "UA 102",
            origin: "SFO",
            destination: "JFK",
            date: "Tue, Mar 18",
            departureTime: "8:15 AM",
            arrivalTime: "4:40 PM",
            duration: "5h 25m",
            status: "On Time",
            price: "$289",
          },
          {
            id: "f2",
            airline: "Delta",
            flightNumber: "DL 244",
            origin: "SFO",
            destination: "JFK",
            date: "Tue, Mar 18",
            departureTime: "10:05 AM",
            arrivalTime: "6:25 PM",
            duration: "5h 20m",
            status: "Delayed",
            price: "$312",
          },
        ],
      },
    },
  },
];

export interface UseEnvelopeStreamOptions {
  /**
   * Cap on how many envelopes we keep in memory. Older envelopes are evicted
   * FIFO. Default 200 — plenty for a 5-hour hackathon session, small enough
   * to keep the inspector fast.
   */
  maxEnvelopes?: number;
  /**
   * If true, seed the buffer with DEMO_ENVELOPES when no real envelopes have
   * been observed yet. Lets the inspector show something on cold boot. The
   * canned envelopes are cleared the moment a real one arrives.
   */
  enableDemoFallback?: boolean;
  /** Agent id to subscribe to. Defaults to the default agent. */
  agentId?: string;
}

export interface UseEnvelopeStreamResult {
  /** All captured envelopes, newest last. */
  envelopes: CapturedEnvelope[];
  /** Envelopes grouped by surfaceId (null bucket = no surface). */
  bySurface: Map<string | null, CapturedEnvelope[]>;
  /** Whether we're currently showing demo (canned) envelopes. */
  isDemo: boolean;
  /** Manually clear the captured buffer. */
  clear: () => void;
}

/**
 * Hook: subscribe to the agent's messages and surface A2UI envelopes.
 */
export function useEnvelopeStream(
  options: UseEnvelopeStreamOptions = {},
): UseEnvelopeStreamResult {
  const {
    maxEnvelopes = 200,
    enableDemoFallback = true,
    agentId,
  } = options;

  const { agent } = useAgent(agentId ? { agentId } : undefined);
  const [envelopes, setEnvelopes] = useState<CapturedEnvelope[]>([]);
  const seenMessageIdsRef = useRef<Set<string>>(new Set());
  // Track which a2ui_operations array length we've already captured per message.
  // Activity messages stream deltas, so the same id can grow.
  const capturedLengthsRef = useRef<Map<string, number>>(new Map());

  // Watch the agent's messages and harvest new a2ui-surface activity messages.
  useEffect(() => {
    if (!agent) return;

    function harvest() {
      const messages = (agent as unknown as { messages?: ReadonlyArray<unknown> })
        .messages;
      if (!messages || !messages.length) return;

      const newCaptures: CapturedEnvelope[] = [];

      for (const raw of messages) {
        const msg = raw as {
          id?: string;
          role?: string;
          activityType?: string;
          content?: Record<string, unknown>;
        };
        if (
          !msg ||
          msg.role !== "activity" ||
          msg.activityType !== A2UI_ACTIVITY_TYPE ||
          !msg.content
        ) {
          continue;
        }
        const ops = msg.content[A2UI_OPERATIONS_KEY];
        if (!Array.isArray(ops)) continue;

        const msgId = msg.id ?? `unknown-${ops.length}`;
        const alreadyCaptured = capturedLengthsRef.current.get(msgId) ?? 0;
        if (ops.length <= alreadyCaptured) continue;

        for (let i = alreadyCaptured; i < ops.length; i++) {
          const env = ops[i] as A2UIEnvelope;
          if (!env || typeof env !== "object") continue;
          newCaptures.push({
            id: `${msgId}:${i}`,
            kind: inferEnvelopeKind(env),
            surfaceId: extractSurfaceId(env),
            capturedAt: new Date().toISOString(),
            agentId: (agent as unknown as { agentId?: string }).agentId,
            body: env,
          });
        }
        capturedLengthsRef.current.set(msgId, ops.length);
        seenMessageIdsRef.current.add(msgId);
      }

      if (newCaptures.length) {
        setEnvelopes((prev) => {
          const next = [...prev, ...newCaptures];
          if (next.length > maxEnvelopes) {
            next.splice(0, next.length - maxEnvelopes);
          }
          return next;
        });
      }
    }

    // Run once now to catch anything already there.
    harvest();

    // Subscribe to agent events. The AbstractAgent has a .subscribe() method
    // that takes an AgentSubscriber. We hook the activity events + general
    // events so we catch deltas as they arrive.
    type SubFn = (sub: Record<string, (...args: unknown[]) => void>) => {
      unsubscribe?: () => void;
    } | (() => void) | void;
    const subscribeFn = (agent as unknown as { subscribe?: SubFn }).subscribe;
    if (typeof subscribeFn !== "function") {
      // No subscribe API — fall back to polling messages every 250ms.
      const poll = window.setInterval(harvest, 250);
      return () => window.clearInterval(poll);
    }

    const result = subscribeFn.call(agent, {
      onActivityDeltaEvent: harvest,
      onActivitySnapshotEvent: harvest,
      onEvent: harvest,
      onRunFinalized: harvest,
    } as unknown as Record<string, (...args: unknown[]) => void>);

    return () => {
      if (typeof result === "function") {
        result();
      } else if (result && typeof (result as { unsubscribe?: () => void }).unsubscribe === "function") {
        (result as { unsubscribe: () => void }).unsubscribe();
      }
    };
  }, [agent, maxEnvelopes]);

  // Effective list: real if any captured, else demo if enabled.
  const effective = useMemo<CapturedEnvelope[]>(() => {
    if (envelopes.length > 0 || !enableDemoFallback) return envelopes;
    const now = new Date().toISOString();
    return DEMO_ENVELOPES.map((env, i) => ({
      id: `demo:${i}`,
      kind: inferEnvelopeKind(env),
      surfaceId: extractSurfaceId(env),
      capturedAt: now,
      agentId: "demo",
      body: env,
    }));
  }, [envelopes, enableDemoFallback]);

  const bySurface = useMemo(() => {
    const map = new Map<string | null, CapturedEnvelope[]>();
    for (const env of effective) {
      const key = env.surfaceId;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(env);
    }
    return map;
  }, [effective]);

  return {
    envelopes: effective,
    bySurface,
    isDemo: envelopes.length === 0 && enableDemoFallback,
    clear: () => {
      seenMessageIdsRef.current.clear();
      capturedLengthsRef.current.clear();
      setEnvelopes([]);
    },
  };
}
