/**
 * Legal Paper Catalog — React Renderers
 *
 * Each renderer maps a component name from definitions.ts to a React
 * implementation. Props are type-checked against the Zod schemas via
 * `CatalogRenderers<LegalPaperCatalogDefinitions>`.
 *
 * All visual styling is owned by `./theme.css` (scoped under
 * `[data-catalog-style="legal-paper"]`) so this file stays focused on
 * markup, semantics, and a11y. Pattern mirrors
 * `src/app/declarative-generative-ui/renderers.tsx`.
 */
"use client";

import React, { useState } from "react";
import type { CatalogRenderers } from "@copilotkit/a2ui-renderer";
import type { LegalPaperCatalogDefinitions } from "./definitions";

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
  // Unresolved path binding fallback — render nothing visible rather than
  // dumping `[object Object]`.
  if (typeof value === "object" && value !== null && "path" in (value as object)) {
    return "";
  }
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

/**
 * Defensive coercion for enum-typed props (`risk`, `tone`, `severity`,
 * `level`). With the `DynEnum` schema wrapper in definitions.ts, the
 * binder resolves `{ path: ... }` bindings to the bound string before the
 * renderer sees them — but a stale or malformed binding could still pass
 * through as `{ path }`. This helper guarantees we never render an object
 * as a React child by returning the fallback for any non-string value.
 *
 * Without this guard the catalog rendered `<span>{risk}</span>` where
 * `risk` was `{ path: "risk" }` and React crashed with
 * "Objects are not valid as a React child (found: object with keys {path})".
 */
function asEnum<T extends string>(
  value: unknown,
  allowed: ReadonlyArray<T>,
  fallback: T | "" = "",
): T | "" {
  if (typeof value === "string" && (allowed as ReadonlyArray<string>).includes(value)) {
    return value as T;
  }
  return fallback;
}

/**
 * Render helper for a single child slot. Accepts:
 *   - a literal ComponentId string,
 *   - a binder-resolved `{ id, basePath }` reference (what the GenericBinder
 *     returns when the schema's single-slot union recognizes `componentId+path`
 *     and the data model resolves to a single item), OR
 *   - an array of refs (what the binder returns for a STRUCTURAL union when
 *     the bound path resolves to an array — even single-slot fields whose
 *     schema is a child-list union like `marginChild` end up here because
 *     `scrapeSchemaBehavior` classifies any `componentId+path` option as
 *     STRUCTURAL and always materializes the result as an array).
 *
 * Returns `null` for anything unrecognized so a stale binding does not
 * crash the surface.
 */
function renderChildRef(
  ref: unknown,
  children: (id: string, basePath?: string) => React.ReactNode,
): React.ReactNode {
  if (typeof ref === "string") {
    return children(ref);
  }
  // STRUCTURAL union (e.g. `marginChild`) resolves to an array even when
  // the underlying data is a single item. Render each entry in order.
  if (Array.isArray(ref)) {
    if (ref.length === 0) return null;
    return ref.map((item, i) => {
      const key =
        typeof item === "string"
          ? `${item}-${i}`
          : item && typeof item === "object" && "id" in (item as object)
            ? `${(item as { id: string }).id}-${i}`
            : `child-${i}`;
      return (
        <React.Fragment key={key}>
          {renderChildRef(item, children)}
        </React.Fragment>
      );
    });
  }
  if (
    ref &&
    typeof ref === "object" &&
    "id" in (ref as object) &&
    typeof (ref as { id: unknown }).id === "string"
  ) {
    const r = ref as { id: string; basePath?: string };
    return children(r.id, r.basePath);
  }
  return null;
}

const SEVERITY_LABELS: Record<string, string> = {
  low: "Low risk",
  medium: "Medium risk",
  high: "High risk",
  critical: "Critical risk",
};

const MARGIN_SEVERITY_LABELS: Record<string, string> = {
  info: "Informational note",
  warning: "Warning",
  critical: "Critical note",
};

// ─── Renderers (type-checked against schema definitions) ─────────────

export const legalPaperCatalogRenderers: CatalogRenderers<LegalPaperCatalogDefinitions> =
  {
    LegalDocumentShell: ({ props, children }) => {
      const items = Array.isArray(props.children) ? props.children : [];
      const title = asText(props.title);
      const effective = asText(props.effectiveDate);
      const parties = Array.isArray(props.parties) ? props.parties : [];
      const verdictChildId =
        typeof props.verdictChild === "string" ? props.verdictChild : null;
      const renderChild = children as unknown as (
        id: string,
        basePath?: string,
      ) => React.ReactNode;

      return (
        <div data-catalog-style="legal-paper">
          <article className="lp-shell">
            <header className="lp-header">
              {title && <h1 className="lp-title">{title}</h1>}
              {parties.length > 0 && (
                <p className="lp-parties">
                  <strong>Between:</strong> {parties.join(" and ")}
                </p>
              )}
              {effective && (
                <p className="lp-effective-date">
                  Effective: {effective}
                </p>
              )}
            </header>

            {verdictChildId && (
              <div className="lp-verdict-slot">
                {renderChild(verdictChildId)}
              </div>
            )}

            <div className="lp-body">
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
                      {renderChild(ref.id, ref.basePath)}
                    </React.Fragment>
                  );
                }
                return null;
              })}
            </div>
          </article>
        </div>
      );
    },

    Verdict: ({ props }) => {
      // Coerce defensively in case a stale `{ path }` binding slips through
      // (DynEnum should resolve at render time, but treat the renderer as
      // the last line of defense).
      const tone = asEnum(props.tone, ["positive", "neutral", "negative"], "neutral");
      const headline = asText(props.headline);
      const summary = asText(props.summary);
      return (
        <section className="lp-verdict" data-tone={tone}>
          {headline && (
            <p className="lp-verdict-headline">{headline}</p>
          )}
          {summary && <p className="lp-verdict-summary">{summary}</p>}
        </section>
      );
    },

    Clause: ({ props, children }) => {
      const number = asText(props.number);
      const heading = asText(props.heading);
      const body = asText(props.body);
      // Coerce risk to a known enum string. With DynEnum the binder
      // resolves `{ path: "risk" }` to e.g. "high"; with bare z.enum it
      // would have passed through as the raw object, and `<span>{risk}</span>`
      // below would have crashed React with "Objects are not valid as a
      // React child".
      const risk = asEnum(
        props.risk,
        ["none", "low", "medium", "high", "critical"],
        "none",
      );
      // redlineChildren resolves to either a literal string[] (catalog
      // declared an array of ComponentIds) or an array of `{ id, basePath }`
      // refs (template binding expanded by the GenericBinder). Anything
      // else (unresolved binding, missing prop) renders nothing.
      const redlines: unknown[] = Array.isArray(props.redlineChildren)
        ? (props.redlineChildren as unknown[])
        : [];
      const showBadge = risk && risk !== "none";
      const renderChild = children as unknown as (
        id: string,
        basePath?: string,
      ) => React.ReactNode;

      return (
        <section className="lp-clause" data-clause-number={number}>
          <div className="lp-clause-main">
            <div className="lp-clause-header">
              {number && (
                <span className="lp-clause-number">{number}</span>
              )}
              {heading && (
                <span className="lp-clause-heading">{heading}</span>
              )}
              {showBadge && (
                <span
                  className="lp-risk-badge"
                  data-level={risk}
                  aria-label={SEVERITY_LABELS[risk] ?? `${risk} risk`}
                >
                  {risk}
                </span>
              )}
            </div>
            {body && <p className="lp-clause-body">{body}</p>}
            {redlines.length > 0 && (
              <div className="lp-clause-redlines">
                {redlines.map((ref, i) => {
                  const key =
                    typeof ref === "string"
                      ? `${ref}-${i}`
                      : ref &&
                          typeof ref === "object" &&
                          "id" in (ref as object)
                        ? `${(ref as { id: string }).id}-${i}`
                        : `redline-${i}`;
                  return (
                    <React.Fragment key={key}>
                      {renderChildRef(ref, renderChild)}
                    </React.Fragment>
                  );
                })}
              </div>
            )}
          </div>

          {props.marginChild != null && renderChildRef(props.marginChild, renderChild) && (
            <aside
              className="lp-clause-margin"
              aria-label={`Annotation for clause ${number || "section"}`}
            >
              {renderChildRef(props.marginChild, renderChild)}
            </aside>
          )}
        </section>
      );
    },

    Redline: ({ props }) => {
      const redlineId = asText(props.redlineId);
      const original = asText(props.original);
      const suggested = asText(props.suggested);
      const rationale = asText(props.rationale);
      const status = asText(props.status) || "pending";

      const isAccepted = status === "accepted";
      const isRejected = status === "rejected";

      return (
        <div
          className="lp-redline"
          data-redline-id={redlineId}
          data-status={status}
        >
          <span className="lp-sr-only">
            Suggested change. Original: {original}. Suggested: {suggested}.
            {rationale ? ` ${rationale}.` : ""}
          </span>

          <div aria-hidden="true">
            {!isAccepted && (
              <>
                <span className="lp-redline-original">{original}</span>{" "}
                <span>→</span>{" "}
              </>
            )}
            <span className="lp-redline-suggested">{suggested}</span>
            {isAccepted && (
              <>
                {" "}
                <span className="lp-redline-status-accepted">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Accepted
                </span>
              </>
            )}
            {isRejected && (
              <>
                {" "}
                <span style={{ fontSize: "0.8rem", color: "var(--paper-muted)" }}>
                  (rejected)
                </span>
              </>
            )}
          </div>

          {rationale && (
            <p className="lp-redline-rationale">{rationale}</p>
          )}
        </div>
      );
    },

    MarginNote: ({ props, children }) => {
      const body = asText(props.body);
      // Coerce defensively — DynEnum should resolve `{ path: "severity" }`
      // to a string, but never let a raw object leak into the data-attr or
      // aria-label lookup.
      const severity = asEnum(
        props.severity,
        ["info", "warning", "critical"],
        "info",
      );
      const ariaLabel = MARGIN_SEVERITY_LABELS[severity] ?? "Annotation";
      return (
        <div
          className="lp-margin-note"
          data-severity={severity}
          aria-label={ariaLabel}
        >
          {body && <p className="lp-margin-note-body">{body}</p>}
          {props.citation && (
            <div className="lp-margin-note-citation">
              {children(props.citation)}
            </div>
          )}
        </div>
      );
    },

    Citation: ({ props }) => {
      const label = asText(props.label);
      const url = asText(props.url);
      const pinpoint = asText(props.pinpoint);

      const body = (
        <>
          {label}
          {pinpoint && (
            <span className="lp-citation-pinpoint">{pinpoint}</span>
          )}
        </>
      );

      if (url) {
        return (
          <a
            className="lp-citation"
            href={url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {body}
          </a>
        );
      }
      return <cite className="lp-citation">{body}</cite>;
    },

    RiskBadge: ({ props }) => {
      // Coerce so a stale `{ path }` binding falls back to "low" instead
      // of crashing on `{display}` below.
      const level = asEnum(
        props.level,
        ["low", "medium", "high", "critical"],
        "low",
      );
      const label = asText(props.label);
      const display = label || level;
      const ariaLabel = SEVERITY_LABELS[level] ?? `${level} risk`;
      return (
        <span
          className="lp-risk-badge"
          data-level={level}
          aria-label={ariaLabel}
        >
          {display}
        </span>
      );
    },

    AcceptRejectBar: ({ props, dispatch }) => {
      const redlineId = asText(props.redlineId);
      const [done, setDone] = useState<null | "accepted" | "rejected">(null);

      const onAccept = () => {
        if (done) return;
        if (props.acceptAction && dispatch) {
          dispatch(props.acceptAction);
        }
        setDone("accepted");
      };
      const onReject = () => {
        if (done) return;
        if (props.rejectAction && dispatch) {
          dispatch(props.rejectAction);
        }
        setDone("rejected");
      };

      return (
        <div
          className="lp-accept-reject-bar"
          role="group"
          aria-label={`Redline ${redlineId} actions`}
        >
          <button
            type="button"
            className="lp-accept-btn"
            onClick={onAccept}
            disabled={done !== null}
            aria-pressed={done === "accepted"}
          >
            {done === "accepted" ? "Accepted" : "Accept"}
          </button>
          <button
            type="button"
            className="lp-reject-btn"
            onClick={onReject}
            disabled={done !== null}
            aria-pressed={done === "rejected"}
          >
            {done === "rejected" ? "Rejected" : "Reject"}
          </button>
        </div>
      );
    },

    LegalDivider: () => (
      <hr className="lp-divider" role="separator" />
    ),
  };
