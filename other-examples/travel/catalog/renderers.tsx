/**
 * Travel Catalog — React Renderers
 *
 * Each renderer maps a component name from definitions.ts to a React
 * implementation. Props are type-checked against the Zod schemas via
 * `CatalogRenderers<TravelCatalogDefinitions>`.
 *
 * All visual styling is owned by `./theme.css` (scoped under
 * `[data-catalog-style="travel"]`) so this file stays focused on markup,
 * semantics, and a11y. Pattern mirrors
 * `src/app/declarative-generative-ui/renderers.tsx`.
 *
 * Port notes (a2a-travel reference):
 *   - ItineraryDay shape borrowed from
 *     examples/showcases/a2a-travel/components/ItineraryCard.tsx (day
 *     header circle + body grid). Adapted to A2UI catalog props so the
 *     agent declares the structure declaratively.
 *   - Day/title typography, body spacing, and the rounded-card grouping
 *     mirror that reference. Colors / fonts are TripWeaver's, not
 *     a2a-travel's.
 */
"use client";

import React from "react";
import type { CatalogRenderers } from "@copilotkit/a2ui-renderer";
import type { TravelCatalogDefinitions } from "./definitions";

// ─── Shared helpers ──────────────────────────────────────────────────

/**
 * Some props arrive as either a literal value or a resolved path-binding
 * value. The GenericBinder resolves bindings to strings/values at runtime
 * but the upstream type still includes the `{ path }` shape. Coerce to
 * a renderable primitive defensively.
 */
function asText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  // Unresolved path binding fallback — render nothing rather than dump
  // `[object Object]`.
  if (typeof value === "object" && value !== null && "path" in (value as object)) {
    return "";
  }
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

const CATEGORY_GLYPHS: Record<string, string> = {
  museum: "M",
  food: "F",
  transit: "T",
  experience: "E",
  rest: "R",
};

const CATEGORY_LABELS: Record<string, string> = {
  museum: "Museum or gallery",
  food: "Food and drink",
  transit: "Transit",
  experience: "Experience or outdoor",
  rest: "Rest stop",
};

// ─── Renderers (type-checked against schema definitions) ─────────────

export const travelCatalogRenderers: CatalogRenderers<TravelCatalogDefinitions> =
  {
    TravelSurface: ({ props, children }) => {
      const items = Array.isArray(props.children) ? props.children : [];
      const headline = asText(props.headline);
      const sub = asText(props.sub);

      return (
        <div data-catalog-style="travel">
          <section className="tw-surface tw-slide-in" aria-labelledby="tw-surface-headline">
            <header className="tw-surface-header">
              {headline && (
                <h2 id="tw-surface-headline" className="tw-surface-headline">
                  {headline}
                </h2>
              )}
              {sub && <p className="tw-surface-sub">{sub}</p>}
            </header>
            <div className="tw-surface-body">
              {items.map((item: unknown, i: number) => {
                if (typeof item === "string") {
                  return (
                    <React.Fragment key={`${item}-${i}`}>
                      {children(item)}
                    </React.Fragment>
                  );
                }
                if (
                  item &&
                  typeof item === "object" &&
                  "id" in (item as object)
                ) {
                  const ref = item as { id: string; basePath?: string };
                  return (
                    <React.Fragment key={`${ref.id}-${i}`}>
                      {(children as unknown as (
                        id: string,
                        basePath?: string,
                      ) => React.ReactNode)(ref.id, ref.basePath)}
                    </React.Fragment>
                  );
                }
                return null;
              })}
            </div>
          </section>
        </div>
      );
    },

    FlightCard: ({ props, dispatch }) => {
      const airline = asText(props.airline);
      const airlineLogo = asText(props.airlineLogo);
      const flightNumber = asText(props.flightNumber);
      const origin = asText(props.origin);
      const destination = asText(props.destination);
      const date = asText(props.date);
      const departTime = asText(props.departTime);
      const arriveTime = asText(props.arriveTime);
      const duration = asText(props.duration);
      const stops = asText(props.stops);
      const price = asText(props.price);

      const onSelect = () => {
        if (props.action && dispatch) dispatch(props.action);
      };

      return (
        <article className="tw-flight-card tw-slide-in" aria-label={`${airline} ${flightNumber}`}>
          <div className="tw-flight-card-head">
            <div className="tw-flight-card-airline">
              {airlineLogo && (
                <img
                  className="tw-flight-card-logo"
                  src={airlineLogo}
                  alt=""
                  aria-hidden="true"
                  width={28}
                  height={28}
                />
              )}
              <div>
                <p className="tw-flight-card-airline-name">{airline}</p>
                <p className="tw-mono tw-flight-card-flight-no">{flightNumber}</p>
              </div>
            </div>
            <div className="tw-flight-card-price">
              <span className="tw-mono tw-price">{price}</span>
              <span className="tw-flight-card-date">{date}</span>
            </div>
          </div>

          <div className="tw-flight-card-route">
            <div className="tw-flight-card-leg" aria-label="Departure">
              <p className="tw-mono tw-time">{departTime}</p>
              <p className="tw-flight-card-airport">{origin}</p>
            </div>
            <div className="tw-flight-card-arrow" aria-hidden="true">
              <span className="tw-flight-card-duration">{duration}</span>
              <span className="tw-flight-card-line" />
              <span className="tw-flight-card-stops">{stops}</span>
            </div>
            <div className="tw-flight-card-leg tw-flight-card-leg-arrive" aria-label="Arrival">
              <p className="tw-mono tw-time">{arriveTime}</p>
              <p className="tw-flight-card-airport">{destination}</p>
            </div>
          </div>

          {props.action && (
            <div className="tw-flight-card-actions">
              <button
                type="button"
                className="tw-btn tw-btn-primary"
                onClick={onSelect}
              >
                Select flight
              </button>
            </div>
          )}
        </article>
      );
    },

    HotelCard: ({ props, dispatch }) => {
      const name = asText(props.name);
      const imageUrl = asText(props.imageUrl);
      const neighborhood = asText(props.neighborhood);
      const rating = asText(props.rating);
      const nightlyRate = asText(props.nightlyRate);

      const onSelect = () => {
        if (props.action && dispatch) dispatch(props.action);
      };

      return (
        <article className="tw-hotel-card tw-slide-in" aria-label={name}>
          {imageUrl && (
            <div className="tw-hotel-card-image-wrap" aria-hidden="true">
              <img
                className="tw-hotel-card-image"
                src={imageUrl}
                alt=""
                loading="lazy"
              />
            </div>
          )}
          <div className="tw-hotel-card-body">
            <div className="tw-hotel-card-row">
              <h3 className="tw-hotel-card-name">{name}</h3>
              {rating && (
                <span
                  className="tw-hotel-card-rating"
                  aria-label={`Rated ${rating} out of 5`}
                >
                  <span aria-hidden="true">★</span> {rating}
                </span>
              )}
            </div>
            <p className="tw-hotel-card-neighborhood">{neighborhood}</p>
            <div className="tw-hotel-card-foot">
              <p className="tw-mono tw-price">
                {nightlyRate}
                <span className="tw-hotel-card-night"> / night</span>
              </p>
              {props.action && (
                <button
                  type="button"
                  className="tw-btn tw-btn-primary"
                  onClick={onSelect}
                >
                  Select
                </button>
              )}
            </div>
          </div>
        </article>
      );
    },

    ItineraryTimeline: ({ props, children }) => {
      const items = Array.isArray(props.children) ? props.children : [];
      const destination = asText(props.destination);
      const days = asText(props.days);

      return (
        <section className="tw-itinerary tw-slide-in" aria-label={`Itinerary for ${destination}`}>
          <header className="tw-itinerary-header">
            <h3 className="tw-itinerary-title">
              {destination} itinerary
            </h3>
            {days && (
              <p className="tw-itinerary-sub">
                {days} day{days === "1" ? "" : "s"} planned
              </p>
            )}
          </header>
          <ol className="tw-itinerary-days">
            {items.map((item: unknown, i: number) => {
              if (typeof item === "string") {
                return (
                  <li key={`${item}-${i}`} className="tw-itinerary-day-wrap">
                    {children(item)}
                  </li>
                );
              }
              if (
                item &&
                typeof item === "object" &&
                "id" in (item as object)
              ) {
                const ref = item as { id: string; basePath?: string };
                return (
                  <li key={`${ref.id}-${i}`} className="tw-itinerary-day-wrap">
                    {(children as unknown as (
                      id: string,
                      basePath?: string,
                    ) => React.ReactNode)(ref.id, ref.basePath)}
                  </li>
                );
              }
              return null;
            })}
          </ol>
        </section>
      );
    },

    ItineraryDay: ({ props, children }) => {
      const items = Array.isArray(props.children) ? props.children : [];
      const day = asText(props.day);
      const title = asText(props.title);

      return (
        <section className="tw-itinerary-day">
          <header className="tw-itinerary-day-head">
            <span className="tw-itinerary-day-pill">{day}</span>
            <h4 className="tw-itinerary-day-title">{title}</h4>
          </header>
          <ul className="tw-itinerary-day-items">
            {items.map((item: unknown, i: number) => {
              if (typeof item === "string") {
                return (
                  <li key={`${item}-${i}`}>
                    {children(item)}
                  </li>
                );
              }
              if (
                item &&
                typeof item === "object" &&
                "id" in (item as object)
              ) {
                const ref = item as { id: string; basePath?: string };
                return (
                  <li key={`${ref.id}-${i}`}>
                    {(children as unknown as (
                      id: string,
                      basePath?: string,
                    ) => React.ReactNode)(ref.id, ref.basePath)}
                  </li>
                );
              }
              return null;
            })}
          </ul>
        </section>
      );
    },

    ItineraryItem: ({ props }) => {
      const time = asText(props.time);
      const title = asText(props.title);
      const location = asText(props.location);
      const category = (props.category as string | undefined) ?? "experience";
      const glyph = CATEGORY_GLYPHS[category] ?? "•";
      const label = CATEGORY_LABELS[category] ?? "Activity";

      return (
        <div className="tw-itinerary-item" data-category={category}>
          <span className="tw-mono tw-itinerary-time">{time}</span>
          <span
            className="tw-itinerary-glyph"
            aria-label={label}
            title={label}
          >
            {glyph}
          </span>
          <div className="tw-itinerary-item-body">
            <p className="tw-itinerary-item-title">{title}</p>
            {location && (
              <p className="tw-itinerary-item-location">{location}</p>
            )}
          </div>
        </div>
      );
    },

    ConfirmationCard: ({ props }) => {
      const headline = asText(props.headline);
      const summary = asText(props.summary);
      const recipient = asText(props.recipient);

      return (
        <div
          className="tw-confirm-card tw-slide-in"
          role="status"
          aria-live="polite"
        >
          <div className="tw-confirm-check" aria-hidden="true">
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <div className="tw-confirm-body">
            {headline && (
              <p className="tw-confirm-headline">{headline}</p>
            )}
            {summary && <p className="tw-confirm-summary">{summary}</p>}
            {recipient && (
              <p className="tw-confirm-recipient tw-mono">{recipient}</p>
            )}
          </div>
        </div>
      );
    },
  };
