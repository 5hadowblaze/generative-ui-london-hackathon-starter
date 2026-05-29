/**
 * Realestate Catalog — React Renderers
 *
 * Each renderer maps a component name from definitions.ts to a React
 * implementation. Props are type-checked against the Zod schemas via
 * `CatalogRenderers<RealestateCatalogDefinitions>`.
 *
 * All visual styling is owned by `./theme.css` (scoped under
 * `[data-catalog-style="realestate"]`) so this file stays focused on
 * markup, semantics, and a11y. Pattern mirrors
 * `src/app/declarative-generative-ui/renderers.tsx`.
 *
 * Visual identity:
 *   - Warm taupe (#9d8765) / sage (#5b7849) / cream (#fbf7ec) palette
 *   - Fraunces for listing headlines (loaded in the route shim via
 *     next/font/google), Inter for body, tabular nums for prices
 *   - Cream cards with subtle paper-grain texture, 1px sage borders,
 *     card lift-on-hover via CSS transition
 *   - Lucide icons (imported per renderer) + custom inline SVGs for
 *     house / bed / bath / sqft glyphs
 */
"use client";

import React, { useState } from "react";
import type { CatalogRenderers } from "@copilotkit/a2ui-renderer";
import { Bed, Bath, Ruler, MapPin, GraduationCap } from "lucide-react";
import type { RealestateCatalogDefinitions } from "./definitions";

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
  if (typeof value === "object" && value !== null && "path" in (value as object)) {
    return "";
  }
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

/** Coerce a school rating (e.g. "8.4") to a number for tinting decisions. */
function asRating(value: unknown): number {
  const n = parseFloat(asText(value));
  return Number.isFinite(n) ? n : 0;
}

const STATUS_TONE: Record<string, "active" | "pending" | "sold"> = {
  Active: "active",
  Pending: "pending",
  Sold: "sold",
};

// ─── Renderers (type-checked against schema definitions) ─────────────

export const realestateCatalogRenderers: CatalogRenderers<RealestateCatalogDefinitions> =
  {
    /**
     * ListingGrid — the root of the listing-search surface. Renders a
     * filter-summary header followed by a responsive grid of children.
     */
    ListingGrid: ({ props, children }) => {
      const items = Array.isArray(props.children) ? props.children : [];
      const summary = asText(props.filterSummary);

      return (
        <div data-catalog-style="realestate" className="re-surface">
          <header className="re-grid-header">
            <p className="re-grid-eyebrow">Brooklyn · Synthetic inventory</p>
            {summary && <h2 className="re-grid-headline">{summary}</h2>}
          </header>

          <div className="re-grid">
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
        </div>
      );
    },

    /**
     * ListingCard — the magazine-style property card. Photo-placeholder
     * gradient at the top, address + price header, beds/baths/sqft row,
     * footer with status dot + schools pill + "View details" button.
     */
    ListingCard: ({ props, dispatch }) => {
      const address = asText(props.address);
      const neighborhood = asText(props.neighborhood);
      const beds = asText(props.beds);
      const baths = asText(props.baths);
      const sqft = asText(props.sqft);
      const price = asText(props.price);
      const pricePerSqft = asText(props.pricePerSqft);
      const propertyType = asText(props.propertyType);
      const status = asText(props.status);
      const rating = asRating(props.schoolRating);

      const tone = STATUS_TONE[status] ?? "active";
      const ratingTier =
        rating >= 8.5 ? "strong" : rating >= 7.5 ? "good" : "fair";

      const onView = () => {
        if (props.action && dispatch) dispatch(props.action);
      };

      return (
        <article className="re-card" data-status={tone}>
          {/* Photo placeholder — taupe→sage gradient, no external assets */}
          <div className="re-card-photo" aria-hidden="true">
            <span className="re-card-photo-type">{propertyType}</span>
          </div>

          <div className="re-card-body">
            <header className="re-card-header">
              <div className="re-card-address-wrap">
                <h3 className="re-card-address">{address}</h3>
                <p className="re-card-neighborhood">
                  <MapPin className="re-icon-inline" aria-hidden="true" />
                  {neighborhood}
                </p>
              </div>
              <span className="re-card-price re-tabular">{price}</span>
            </header>

            <hr className="re-divider" />

            <dl className="re-card-stats">
              <div className="re-card-stat">
                <Bed className="re-icon" aria-hidden="true" />
                <span className="re-tabular">{beds}</span>
                <span className="re-stat-label">bd</span>
              </div>
              <div className="re-card-stat">
                <Bath className="re-icon" aria-hidden="true" />
                <span className="re-tabular">{baths}</span>
                <span className="re-stat-label">ba</span>
              </div>
              <div className="re-card-stat">
                <Ruler className="re-icon" aria-hidden="true" />
                <span className="re-tabular">{sqft}</span>
                <span className="re-stat-label">sqft</span>
              </div>
            </dl>

            <p className="re-card-ppsqft re-tabular">{pricePerSqft}</p>

            <footer className="re-card-footer">
              <div className="re-card-footer-meta">
                <span
                  className="re-status-dot"
                  data-status={tone}
                  aria-hidden="true"
                />
                <span className="re-status-label">{status}</span>
                {rating > 0 && (
                  <span
                    className="re-school-pill"
                    data-tier={ratingTier}
                    title="School rating (0–10)"
                  >
                    <GraduationCap className="re-icon-tiny" aria-hidden="true" />
                    {rating.toFixed(1)}
                  </span>
                )}
              </div>
              {props.action && (
                <button
                  type="button"
                  className="re-button re-button-ghost"
                  onClick={onView}
                >
                  View details
                </button>
              )}
            </footer>
          </div>
        </article>
      );
    },

    /**
     * ListingDetail — full magazine-style detail page for a single
     * listing. Hero header with photo carousel + price, amenities chips,
     * room breakdown, comps table, nearby schools.
     */
    ListingDetail: ({ props, children, dispatch }) => {
      const address = asText(props.address);
      const neighborhood = asText(props.neighborhood);
      const price = asText(props.price);
      const pricePerSqft = asText(props.pricePerSqft);
      const propertyType = asText(props.propertyType);
      const status = asText(props.status);
      const beds = asText(props.beds);
      const baths = asText(props.baths);
      const sqft = asText(props.sqft);
      const yearBuilt = asText(props.yearBuilt);
      const rating = asRating(props.schoolRating);
      const listingAgent = asText(props.listingAgent);
      const notes = asText(props.notes);

      const amenities = Array.isArray(props.amenitiesChildren)
        ? props.amenitiesChildren
        : [];
      const rooms = Array.isArray(props.roomsChildren)
        ? props.roomsChildren
        : [];
      const comps = Array.isArray(props.compsChildren)
        ? props.compsChildren
        : [];
      const schools = Array.isArray(props.schoolsChildren)
        ? props.schoolsChildren
        : [];

      const onTour = () => {
        if (props.tourAction && dispatch) dispatch(props.tourAction);
      };
      const onOffer = () => {
        if (props.offerAction && dispatch) dispatch(props.offerAction);
      };

      return (
        <div data-catalog-style="realestate" className="re-surface">
          <article className="re-detail">
            {/* HERO */}
            <header className="re-detail-hero">
              <div className="re-detail-photo" aria-hidden="true">
                <span className="re-detail-photo-type">{propertyType}</span>
              </div>
              <div className="re-detail-hero-meta">
                <p className="re-grid-eyebrow">
                  <MapPin className="re-icon-inline" aria-hidden="true" />
                  {neighborhood} · Brooklyn
                </p>
                <h1 className="re-detail-address">{address}</h1>
                <div className="re-detail-priceline">
                  <span className="re-detail-price re-tabular">{price}</span>
                  <span className="re-detail-ppsqft re-tabular">
                    {pricePerSqft}
                  </span>
                </div>
                <dl className="re-detail-stats">
                  <div className="re-card-stat">
                    <Bed className="re-icon" aria-hidden="true" />
                    <span className="re-tabular">{beds}</span>
                    <span className="re-stat-label">beds</span>
                  </div>
                  <div className="re-card-stat">
                    <Bath className="re-icon" aria-hidden="true" />
                    <span className="re-tabular">{baths}</span>
                    <span className="re-stat-label">baths</span>
                  </div>
                  <div className="re-card-stat">
                    <Ruler className="re-icon" aria-hidden="true" />
                    <span className="re-tabular">{sqft}</span>
                    <span className="re-stat-label">sqft</span>
                  </div>
                  {yearBuilt && (
                    <div className="re-card-stat">
                      <span className="re-stat-label">Built</span>
                      <span className="re-tabular">{yearBuilt}</span>
                    </div>
                  )}
                </dl>
                <div className="re-detail-cta-row">
                  {props.tourAction && (
                    <button
                      type="button"
                      className="re-button re-button-primary"
                      onClick={onTour}
                    >
                      Schedule a tour
                    </button>
                  )}
                  {props.offerAction && (
                    <button
                      type="button"
                      className="re-button re-button-secondary"
                      onClick={onOffer}
                    >
                      Draft an offer
                    </button>
                  )}
                </div>
                {status && (
                  <p className="re-detail-status">
                    <span
                      className="re-status-dot"
                      data-status={STATUS_TONE[status] ?? "active"}
                      aria-hidden="true"
                    />
                    {status} {listingAgent ? `· Listed by ${listingAgent}` : ""}
                  </p>
                )}
              </div>
            </header>

            {/* NOTES */}
            {notes && (
              <section className="re-detail-section">
                <h2 className="re-section-headline">About this home</h2>
                <p className="re-detail-notes">{notes}</p>
              </section>
            )}

            {/* AMENITIES */}
            {amenities.length > 0 && (
              <section className="re-detail-section">
                <h2 className="re-section-headline">Amenities</h2>
                <ul className="re-amenities" role="list">
                  {amenities.map((id, i) => (
                    <li key={`${typeof id === "string" ? id : `am-${i}`}-${i}`}>
                      {typeof id === "string" ? children(id) : null}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* ROOMS */}
            {rooms.length > 0 && (
              <section className="re-detail-section">
                <h2 className="re-section-headline">Rooms</h2>
                <dl className="re-rooms">
                  {rooms.map((id, i) => (
                    <React.Fragment
                      key={`${typeof id === "string" ? id : `room-${i}`}-${i}`}
                    >
                      {typeof id === "string" ? children(id) : null}
                    </React.Fragment>
                  ))}
                </dl>
              </section>
            )}

            {/* COMPS */}
            {comps.length > 0 && (
              <section className="re-detail-section">
                <h2 className="re-section-headline">Recent comps</h2>
                <div className="re-comps-table" role="table">
                  <div className="re-comps-thead" role="row">
                    <span role="columnheader">Address</span>
                    <span role="columnheader" className="re-comps-num">
                      Beds / Baths
                    </span>
                    <span role="columnheader" className="re-comps-num">
                      Sqft
                    </span>
                    <span role="columnheader" className="re-comps-num">
                      $ / sqft
                    </span>
                    <span role="columnheader" className="re-comps-num">
                      Sold
                    </span>
                    <span role="columnheader" className="re-comps-num">
                      Price
                    </span>
                  </div>
                  {comps.map((id, i) => (
                    <React.Fragment
                      key={`${typeof id === "string" ? id : `comp-${i}`}-${i}`}
                    >
                      {typeof id === "string" ? children(id) : null}
                    </React.Fragment>
                  ))}
                </div>
              </section>
            )}

            {/* SCHOOLS */}
            {schools.length > 0 && (
              <section className="re-detail-section">
                <h2 className="re-section-headline">
                  Nearby schools{rating > 0 ? ` · avg ${rating.toFixed(1)}/10` : ""}
                </h2>
                <ul className="re-schools" role="list">
                  {schools.map((id, i) => (
                    <li
                      key={`${typeof id === "string" ? id : `sch-${i}`}-${i}`}
                    >
                      {typeof id === "string" ? children(id) : null}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </article>
        </div>
      );
    },

    AmenityChip: ({ props }) => {
      const label = asText(props.label);
      return <span className="re-amenity-chip">{label}</span>;
    },

    RoomRow: ({ props }) => {
      const label = asText(props.label);
      const detail = asText(props.detail);
      return (
        <div className="re-room-row">
          <dt className="re-room-label">{label}</dt>
          <dd className="re-room-detail">{detail}</dd>
        </div>
      );
    },

    CompRow: ({ props }) => {
      const address = asText(props.address);
      const soldPrice = asText(props.soldPrice);
      const beds = asText(props.beds);
      const baths = asText(props.baths);
      const sqft = asText(props.sqft);
      const pricePerSqft = asText(props.pricePerSqft);
      const soldDate = asText(props.soldDate);
      return (
        <div className="re-comp-row" role="row">
          <span className="re-comp-address" role="cell">
            {address}
          </span>
          <span className="re-comps-num re-tabular" role="cell">
            {beds}br / {baths}ba
          </span>
          <span className="re-comps-num re-tabular" role="cell">
            {sqft}
          </span>
          <span className="re-comps-num re-tabular" role="cell">
            {pricePerSqft}
          </span>
          <span className="re-comps-num re-tabular" role="cell">
            {soldDate}
          </span>
          <span className="re-comps-num re-tabular re-comp-soldprice" role="cell">
            {soldPrice}
          </span>
        </div>
      );
    },

    SchoolRow: ({ props }) => {
      const name = asText(props.name);
      const level = asText(props.level);
      const rating = asRating(props.rating);
      const distance = asText(props.distance);
      const tier = rating >= 8.5 ? "strong" : rating >= 7.5 ? "good" : "fair";
      return (
        <div className="re-school-row">
          <div className="re-school-meta">
            <p className="re-school-name">{name}</p>
            <p className="re-school-level">{level}</p>
          </div>
          <div className="re-school-stats">
            <span className="re-school-pill" data-tier={tier}>
              <GraduationCap className="re-icon-tiny" aria-hidden="true" />
              {rating > 0 ? rating.toFixed(1) : "—"}
            </span>
            {distance && (
              <span className="re-school-distance re-tabular">{distance}</span>
            )}
          </div>
        </div>
      );
    },

    /**
     * TourSlotPicker — listing header + grouped slot grid.
     */
    TourSlotPicker: ({ props, children }) => {
      const address = asText(props.address);
      const neighborhood = asText(props.neighborhood);
      const slots = Array.isArray(props.slotsChildren)
        ? props.slotsChildren
        : [];

      return (
        <div data-catalog-style="realestate" className="re-surface">
          <article className="re-tour">
            <header className="re-tour-header">
              <p className="re-grid-eyebrow">
                <MapPin className="re-icon-inline" aria-hidden="true" />
                {neighborhood} · Brooklyn
              </p>
              <h1 className="re-tour-address">{address}</h1>
              <p className="re-tour-blurb">
                Pick a tour slot — the listing agent will confirm by text within
                an hour.
              </p>
            </header>

            <div className="re-tour-grid" role="list">
              {slots.map((id, i) => (
                <React.Fragment
                  key={`${typeof id === "string" ? id : `slot-${i}`}-${i}`}
                >
                  {typeof id === "string" ? children(id) : null}
                </React.Fragment>
              ))}
            </div>
          </article>
        </div>
      );
    },

    TourSlot: ({ props, dispatch }) => {
      const day = asText(props.day);
      const time = asText(props.time);
      const availableRaw = asText(props.available);
      const isAvailable = availableRaw !== "false" && availableRaw !== "False";
      const [picked, setPicked] = useState(false);

      const onPick = () => {
        if (!isAvailable || picked) return;
        if (props.action && dispatch) dispatch(props.action);
        setPicked(true);
      };

      return (
        <button
          type="button"
          role="listitem"
          className="re-tour-slot"
          data-available={isAvailable}
          data-picked={picked}
          aria-pressed={picked}
          disabled={!isAvailable || picked}
          onClick={onPick}
        >
          <span className="re-tour-slot-day">{day}</span>
          <span className="re-tour-slot-time re-tabular">{time}</span>
          {!isAvailable && (
            <span className="re-tour-slot-flag">Booked</span>
          )}
          {picked && (
            <span className="re-tour-slot-flag re-tour-slot-picked">Picked</span>
          )}
        </button>
      );
    },

    /**
     * OfferLetterDraft — editable text card + action bar.
     *
     * The textarea is wired locally so the demo can SHOW that the letter
     * is editable, but the agent's "letter" prop is the source of truth
     * on initial render. Future iteration: round-trip edits back via
     * an `update_data_model` event.
     */
    OfferLetterDraft: ({ props, dispatch }) => {
      const address = asText(props.address);
      const neighborhood = asText(props.neighborhood);
      const askingPrice = asText(props.askingPrice);
      const offerAmount = asText(props.offerAmount);
      const pctOfAsking = asText(props.pctOfAsking);
      const initialLetter = asText(props.letter);

      const [letter, setLetter] = useState(initialLetter);
      const [status, setStatus] = useState<
        null | "sent" | "revising" | "cancelled"
      >(null);

      // Sync if the agent re-renders with a fresh letter.
      React.useEffect(() => {
        setLetter(initialLetter);
      }, [initialLetter]);

      const onSend = () => {
        if (status) return;
        if (props.sendAction && dispatch) dispatch(props.sendAction);
        setStatus("sent");
      };
      const onRevise = () => {
        if (props.reviseAction && dispatch) dispatch(props.reviseAction);
        setStatus("revising");
      };
      const onCancel = () => {
        if (status === "cancelled") return;
        if (props.cancelAction && dispatch) dispatch(props.cancelAction);
        setStatus("cancelled");
      };

      return (
        <div data-catalog-style="realestate" className="re-surface">
          <article className="re-offer">
            <header className="re-offer-header">
              <p className="re-grid-eyebrow">Offer letter · Draft</p>
              <h1 className="re-offer-address">{address}</h1>
              <p className="re-offer-neighborhood">
                <MapPin className="re-icon-inline" aria-hidden="true" />
                {neighborhood} · Brooklyn
              </p>
              <dl className="re-offer-summary">
                <div className="re-offer-summary-cell">
                  <dt>Asking</dt>
                  <dd className="re-tabular">{askingPrice}</dd>
                </div>
                <div className="re-offer-summary-cell re-offer-summary-cell-hero">
                  <dt>Your offer</dt>
                  <dd className="re-tabular">{offerAmount}</dd>
                </div>
                <div className="re-offer-summary-cell">
                  <dt>% of ask</dt>
                  <dd className="re-tabular">{pctOfAsking}</dd>
                </div>
              </dl>
            </header>

            <label className="re-offer-letter-label" htmlFor="re-offer-letter">
              Letter body
            </label>
            <textarea
              id="re-offer-letter"
              className="re-offer-letter"
              value={letter}
              onChange={(e) => setLetter(e.target.value)}
              rows={Math.max(10, letter.split("\n").length + 1)}
              spellCheck
              disabled={status === "sent" || status === "cancelled"}
            />

            <footer className="re-offer-actions">
              {status === "sent" && (
                <p className="re-offer-status" role="status">
                  Offer sent — the listing agent will confirm receipt.
                </p>
              )}
              {status === "cancelled" && (
                <p className="re-offer-status re-offer-status-muted" role="status">
                  Draft discarded.
                </p>
              )}
              <div className="re-offer-actions-row">
                {props.cancelAction && (
                  <button
                    type="button"
                    className="re-button re-button-ghost"
                    onClick={onCancel}
                    disabled={status === "sent" || status === "cancelled"}
                  >
                    Cancel
                  </button>
                )}
                {props.reviseAction && (
                  <button
                    type="button"
                    className="re-button re-button-secondary"
                    onClick={onRevise}
                    disabled={status === "sent" || status === "cancelled"}
                  >
                    Revise
                  </button>
                )}
                {props.sendAction && (
                  <button
                    type="button"
                    className="re-button re-button-primary"
                    onClick={onSend}
                    disabled={status !== null}
                  >
                    {status === "sent" ? "Sent" : "Send offer"}
                  </button>
                )}
              </div>
            </footer>
          </article>
        </div>
      );
    },
  };
