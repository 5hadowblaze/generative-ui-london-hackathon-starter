"use client";

/**
 * Homestead — Buyer's-agent demo route.
 *
 * URL: /other-examples/realestate
 * Route group: (realestate) — provides the realestateCatalog + `realestate`
 * agent via sibling `src/app/(realestate)/layout.tsx`. The route-group
 * convention lets this page coexist with the dashboard at `/` without
 * double-mounting CopilotKit.
 *
 * Layout shape (magazine-style — NOT generic chat-left/surface-right):
 *
 *   ┌───────────────────────────────────────────────────────────────┐
 *   │ Homestead header (cream tile + sage H mark + saved/comps nav) │
 *   ├───────────────────────────────────────────────────────────────┤
 *   │                                                               │
 *   │              MAIN CANVAS (full-width magazine surface)        │
 *   │                                                               │
 *   │   ┌──────────────────────────────────────────────────────┐    │
 *   │   │  A2UI surface mounts here (ListingGrid, Detail, etc.) │   │
 *   │   └──────────────────────────────────────────────────────┘    │
 *   │                                                               │
 *   │           Footer: "Synthetic listings · Brooklyn, NY"         │
 *   │                                                               │
 *   └───────────────────────────────────────────────────────────────┘
 *
 *      A slide-over chat panel docks to the right edge and toggles
 *      open via the "Chat" button in the header. The chat panel does
 *      NOT push the canvas; it overlays it with a subtle backdrop.
 *
 * No `<EnvelopeInspector />` — by spec. The realestate example targets
 * buyers, and the magazine surface owns the full canvas.
 */

import { useEffect, useRef, useState } from "react";
import { Fraunces, Inter } from "next/font/google";
import {
  CopilotChat,
  useAgent,
  useFrontendTool,
} from "@copilotkit/react-core/v2";
import {
  Heart,
  BarChart3,
  MessageSquare,
  X,
  Bell,
  CornerUpRight,
} from "lucide-react";

// Side-effect import: registers the scoped realestate theme. The rules are
// gated by `[data-catalog-style="realestate"]` so they only apply inside
// this page's catalog surfaces.
import "../../../../../other-examples/realestate/catalog/theme.css";
import "./realestate.css";

// Display + body fonts for the magazine catalog. Exposed as CSS variables
// so theme.css picks them up via `var(--font-fraunces)` / `var(--font-inter)`.
const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-fraunces",
  display: "swap",
});
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

const AGENT_ID = "realestate";
const AUTO_PROMPT =
  "Show me 3BR homes in Brooklyn under $1.5M. Call show_listings with neighborhood unset, beds_min=3, max_price=1500000, limit=3.";

/**
 * Auto-load the listing grid on first mount via a synthetic user message
 * so the demo is wow-on-load. Guarded by a ref so React StrictMode's
 * double-mount doesn't double-fire.
 */
function useAutoSearch() {
  const { agent } = useAgent({ agentId: AGENT_ID });
  const firedRef = useRef(false);

  useEffect(() => {
    if (!agent) return;
    if (firedRef.current) return;

    // If the user already has a conversation in flight, don't hijack it.
    const messages =
      (agent as unknown as { messages?: ReadonlyArray<unknown> }).messages ?? [];
    if (messages.length > 0) {
      firedRef.current = true;
      return;
    }

    firedRef.current = true;
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
    } catch (err) {
      // If the agent isn't fully wired yet, log and let the user kick it manually.
      // eslint-disable-next-line no-console
      console.warn("[realestate] auto-search failed:", err);
    }
  }, [agent]);
}

/**
 * Sage "H" logo mark — single SVG, no external assets. Lives in a
 * cream-tile square per the spec.
 */
function HomesteadMark() {
  return (
    <span className="hs-logo-tile" aria-hidden="true">
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#5b7849"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* House roofline */}
        <path d="M3 11.5 L12 4 L21 11.5" />
        {/* House body */}
        <path d="M5 10.5 V20 H19 V10.5" />
        {/* Center "H" stroke */}
        <path d="M9.5 13 V18.5 M14.5 13 V18.5 M9.5 15.5 H14.5" />
      </svg>
    </span>
  );
}

/**
 * Homestead header — cream tile + sage H mark + product name + top nav
 * (Saved listings count, Comps toggle, Chat trigger).
 */
function HomesteadHeader({
  savedCount,
  compsOpen,
  onToggleComps,
  onToggleChat,
  chatOpen,
}: {
  savedCount: number;
  compsOpen: boolean;
  onToggleComps: () => void;
  onToggleChat: () => void;
  chatOpen: boolean;
}) {
  return (
    <header className="hs-header">
      <div className="hs-header-left">
        <HomesteadMark />
        <div className="hs-header-wordmark">
          <p className="hs-header-product">Homestead</p>
          <p className="hs-header-tagline">Buyer&apos;s Agent</p>
        </div>
      </div>
      <nav className="hs-header-nav" aria-label="Homestead navigation">
        <button
          type="button"
          className="hs-nav-btn"
          aria-label={`Saved listings (${savedCount})`}
        >
          <Heart className="hs-nav-icon" aria-hidden="true" />
          <span className="hs-nav-label">Saved</span>
          <span className="hs-nav-badge">{savedCount}</span>
        </button>
        <button
          type="button"
          className="hs-nav-btn"
          aria-pressed={compsOpen}
          data-active={compsOpen}
          onClick={onToggleComps}
        >
          <BarChart3 className="hs-nav-icon" aria-hidden="true" />
          <span className="hs-nav-label">Comps</span>
        </button>
        <button
          type="button"
          className="hs-nav-btn hs-nav-btn-primary"
          aria-pressed={chatOpen}
          aria-expanded={chatOpen}
          aria-controls="hs-chat-panel"
          onClick={onToggleChat}
        >
          <MessageSquare className="hs-nav-icon" aria-hidden="true" />
          <span className="hs-nav-label">{chatOpen ? "Close chat" : "Chat"}</span>
        </button>
      </nav>
    </header>
  );
}

/**
 * Slide-over chat panel docked to the right edge. Overlays the canvas;
 * does not push it.
 */
function ChatSlideOver({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <>
      <div
        className="hs-chat-scrim"
        data-open={open}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        id="hs-chat-panel"
        className="hs-chat-panel"
        data-open={open}
        aria-label="Buyer's-agent chat"
        aria-hidden={!open}
      >
        <div className="hs-chat-panel-header">
          <div>
            <p className="hs-chat-eyebrow">Buyer&apos;s agent</p>
            <p className="hs-chat-title">Homestead, at your service.</p>
          </div>
          <button
            type="button"
            className="hs-chat-close"
            onClick={onClose}
            aria-label="Close chat"
          >
            <X aria-hidden="true" />
          </button>
        </div>
        <div className="hs-chat-body">
          <CopilotChat
            agentId={AGENT_ID}
            attachments={{ enabled: false }}
            input={{
              disclaimer: () => null,
              className: "pb-4",
            }}
          />
        </div>
      </aside>
    </>
  );
}

/**
 * Empty-state hero shown while the auto-search request is in flight or
 * the agent hasn't streamed its first surface yet.
 */
function EmptyHero({ isRunning }: { isRunning: boolean }) {
  return (
    <section className="hs-empty-hero">
      <p className="re-grid-eyebrow" data-catalog-style="realestate">
        Brooklyn · Synthetic inventory
      </p>
      <h1 className="hs-empty-title">
        Find a home worth coming home to.
      </h1>
      <p className="hs-empty-blurb">
        I&apos;m Homestead — your synthetic Brooklyn buyer&apos;s agent. Ask me to
        surface listings, drill into a property with comps and schools, schedule
        a tour, or draft an offer letter. Everything you see below is generated
        by the agent through A2UI envelopes.
      </p>
      <ul className="hs-empty-suggestions">
        <li>
          <CornerUpRight aria-hidden="true" />
          <span>&quot;3BR homes in Brooklyn under $1.5M&quot;</span>
        </li>
        <li>
          <CornerUpRight aria-hidden="true" />
          <span>&quot;Drill into 123 Maple St&quot;</span>
        </li>
        <li>
          <CornerUpRight aria-hidden="true" />
          <span>&quot;Schedule a tour Saturday afternoon&quot;</span>
        </li>
        <li>
          <CornerUpRight aria-hidden="true" />
          <span>&quot;Draft an offer at $1.4M&quot;</span>
        </li>
      </ul>
      <p className="hs-empty-status" role="status">
        {isRunning ? "Searching listings…" : "Ready when you are."}
      </p>
    </section>
  );
}

export default function HomesteadPage() {
  // Auto-prompt disabled (2026-05-29) — see healthcare page.tsx for rationale.
  // The useAutoSearch hook races CopilotKit's runtime message map, causing
  // INCOMPLETE_STREAM: Message not found on subsequent user prompts.
  // useAutoSearch();

  // Header state.
  const [savedCount] = useState(2); // synthetic — heart-button is decorative
  const [compsOpen, setCompsOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  // Frontend tool placeholder so CopilotKit doesn't warn about an empty tool
  // surface (matches the legal page's pattern).
  useFrontendTool({
    name: "noop_realestate_chip",
    description: "Placeholder — never invoked. Suppresses 'no tools' warning.",
    handler: async () => {},
  });

  const { agent } = useAgent({ agentId: AGENT_ID });
  const isRunning =
    (agent as unknown as { isRunning?: boolean }).isRunning ?? false;
  const messageCount =
    ((agent as unknown as { messages?: ReadonlyArray<unknown> }).messages ?? [])
      .length;
  // Show the empty hero only until the agent has streamed at least one
  // assistant message (i.e. a tool call + surface envelope).
  const showEmpty = messageCount < 2;

  return (
    <div className={`hs-shell ${fraunces.variable} ${inter.variable}`}>
      <HomesteadHeader
        savedCount={savedCount}
        compsOpen={compsOpen}
        onToggleComps={() => setCompsOpen((v) => !v)}
        onToggleChat={() => setChatOpen((v) => !v)}
        chatOpen={chatOpen}
      />

      <main className="hs-canvas">
        {showEmpty && <EmptyHero isRunning={isRunning} />}

        {/* The actual A2UI surface is mounted by the CopilotKit provider via
            the realestate catalog. The agent's first envelope creates the
            surface and populates it inside this canvas. The renderer is
            already wrapped in [data-catalog-style="realestate"] inside each
            top-level component. */}

        {compsOpen && (
          <aside className="hs-comps-rail" role="complementary">
            <p className="hs-comps-rail-eyebrow">
              <Bell aria-hidden="true" /> Comps toggle
            </p>
            <p className="hs-comps-rail-body">
              When the agent surfaces a ListingDetail, the &quot;Recent comps&quot;
              section is highlighted. Toggle off to dim that section.
            </p>
          </aside>
        )}
      </main>

      <footer className="hs-footer">
        <span>Homestead · Synthetic listings · Brooklyn, NY</span>
        <span className="hs-footer-fineprint">
          Demo only — no actual transactions. Listings, comps, and schools are
          fictional.
        </span>
      </footer>

      <ChatSlideOver open={chatOpen} onClose={() => setChatOpen(false)} />
    </div>
  );
}
