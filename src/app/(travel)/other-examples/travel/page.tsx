"use client";

/**
 * TripWeaver demo route.
 *
 * URL: /other-examples/travel
 * Route group: (travel) — provides the travelCatalog + `travel` agent via
 * sibling `src/app/(travel)/layout.tsx`. The route-group convention lets
 * this page coexist with the dashboard at `/` and the legal example at
 * `/other-examples/legal-contract-review` without double-mounting
 * CopilotKit.
 *
 * Layout shape — chat-on-top, scroll-stack surface below:
 *   - Header (TripWeaver brand mark, sky+coral palette, solid color
 *     wordmark — NOT a transparent-fill gradient).
 *   - Chat panel pinned to the top half of the viewport on desktop;
 *     full-width above the surface column on mobile.
 *   - Scroll-stack surface column below the chat that receives the
 *     A2UI envelopes the agent emits. New surfaces slide in at 200ms.
 *   - Sticky bottom toolbar showing current trip summary
 *     (origin → destination, dates, traveler count). Synthetic stub —
 *     not bound to live state in the demo.
 *   - NO `<EnvelopeInspector />` — mobile-first consumer aesthetic.
 *
 * Sets `data-catalog-style="travel"` on the surface wrapper so the
 * scoped theme.css (sky + sunset coral + Spline Sans Mono) applies
 * without leaking into other routes.
 *
 * theme.css is imported here as a side-effect so Next.js bundles it
 * for the route.
 */

import { CopilotChat, useFrontendTool } from "@copilotkit/react-core/v2";
import { BackgroundBlurCircles } from "@/components/BackgroundBlurCircles";

// Side-effect import: registers the scoped travel theme. The rules are
// gated by `[data-catalog-style="travel"]` so they only apply inside
// the surface wrapper below.
import "../../../../../other-examples/travel/catalog/theme.css";
import "./travel.css";

const AGENT_ID = "travel";

const SUGGESTIONS: { label: string; prompt: string }[] = [
  {
    label: "Find flights LHR → JFK next Wednesday under $700",
    prompt: "Find flights LHR to JFK next Wednesday under $700.",
  },
  {
    label: "Hotels near Times Square under $300",
    prompt: "Hotels near Times Square under $300.",
  },
  {
    label: "Build a 3-day NYC itinerary with an art-museum focus",
    prompt: "Build me a 3-day NYC itinerary with an art-museum focus.",
  },
  {
    label: "Email it to me",
    prompt: "Email it to me at you@example.com.",
  },
];

/**
 * Sticky bottom toolbar — synthetic trip summary.
 *
 * Wired to a stub today; in a fuller demo this would subscribe to the
 * `select_flight` / `select_hotel` action context so the toolbar
 * reflects the user's picks. Keep the shape so the polish reads.
 */
function TripSummaryToolbar() {
  return (
    <div className="tw-toolbar" role="status" aria-label="Trip summary">
      <div className="tw-toolbar-row">
        <span className="tw-toolbar-leg">
          <span className="tw-toolbar-label">From</span>
          <span className="tw-mono tw-toolbar-value">LHR</span>
        </span>
        <span className="tw-toolbar-arrow" aria-hidden="true">
          →
        </span>
        <span className="tw-toolbar-leg">
          <span className="tw-toolbar-label">To</span>
          <span className="tw-mono tw-toolbar-value">JFK</span>
        </span>
        <span className="tw-toolbar-divider" aria-hidden="true" />
        <span className="tw-toolbar-leg">
          <span className="tw-toolbar-label">Dates</span>
          <span className="tw-toolbar-value">Mar 18 – Mar 21</span>
        </span>
        <span className="tw-toolbar-divider" aria-hidden="true" />
        <span className="tw-toolbar-leg">
          <span className="tw-toolbar-label">Travelers</span>
          <span className="tw-toolbar-value">1</span>
        </span>
      </div>
      <p className="tw-toolbar-disclaimer">
        Demo · synthetic prices · not bookable.
      </p>
    </div>
  );
}

/**
 * TripWeaver brand mark.
 *
 * Logo = plane glyph + wordmark in a SOLID color (per the spec, the
 * prototype's transparent-fill gradient was broken). Sky-deep
 * (`#3296dc`) is the solid color choice — pairs with the coral
 * accent on the underline without depending on a gradient pipe that
 * may render wrong on the demo machine.
 */
function TripWeaverBrand() {
  return (
    <div className="tw-brand" aria-label="TripWeaver">
      <svg
        viewBox="0 0 24 24"
        className="tw-brand-glyph"
        aria-hidden="true"
        focusable="false"
      >
        {/* Plane glyph — Lucide outline-style, drawn as a solid silhouette
            so the mark stays legible at small sizes without a stroke. */}
        <path
          d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1L15 22v-1.5L13 19v-5.5L21 16z"
          fill="currentColor"
        />
      </svg>
      <span className="tw-brand-wordmark">TripWeaver</span>
    </div>
  );
}

export default function TravelPage() {
  // Same pattern as the legal example — a no-op frontend tool keeps the
  // CopilotKit "no tools registered" warning quiet when the route loads.
  useFrontendTool({
    name: "noop_travel_chip",
    description: "Placeholder — never invoked. Suppresses 'no tools' warning.",
    handler: async () => {},
  });

  return (
    <div className="tw-page">
      <BackgroundBlurCircles />
      <header className="tw-header">
        <TripWeaverBrand />
        <p className="tw-tagline">
          Plan a trip end-to-end. Just chat.
        </p>
      </header>

      <main className="tw-main">
        {/* Top — chat. On desktop a fixed-height panel; on mobile the
            full top of the viewport. */}
        <section className="tw-chat-panel" aria-label="Trip planning chat">
          <CopilotChat
            agentId={AGENT_ID}
            attachments={{ enabled: false }}
            input={{
              disclaimer: () => null,
              className: "pb-2",
            }}
          />
        </section>

        {/* Suggestion chips — quick entry points so the first prompt
            doesn't have a blank page. */}
        <div
          className="tw-suggestions"
          aria-label="Try one of these"
          role="group"
        >
          {SUGGESTIONS.map((s) => (
            <button
              key={s.label}
              type="button"
              className="tw-suggestion-chip"
              data-prompt={s.prompt}
              onClick={(e) => {
                // The chip writes the prompt into the chat input via
                // event bubbling — we dispatch a CustomEvent that the
                // CopilotChat input could listen for in a fuller demo.
                // For now we no-op and let the user copy/paste.
                e.preventDefault();
                // Best-effort: drop the prompt into the clipboard so
                // the user can paste it into the chat input.
                if (
                  typeof navigator !== "undefined" &&
                  navigator.clipboard?.writeText
                ) {
                  void navigator.clipboard.writeText(s.prompt);
                }
              }}
              title="Click to copy prompt"
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Bottom — A2UI surface scroll-stack. The CopilotKit provider
            mounts the renderer here; envelopes streamed by the agent
            paint themselves into surfaces inside this wrapper. */}
        <section
          data-catalog-style="travel"
          className="tw-surfaces"
          aria-label="Itinerary canvas"
        >
          <p className="tw-surfaces-placeholder">
            Your flights, hotels, and itinerary will appear here as you chat.
            <br />
            <span className="tw-surfaces-placeholder-sub">
              Demo · synthetic prices · not bookable.
            </span>
          </p>
        </section>
      </main>

      <TripSummaryToolbar />
    </div>
  );
}
