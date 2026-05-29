"use client";

/**
 * Legal-canvas error banner — graceful fallback for the AG-UI checkpoint
 * blocker (and similar protocol-level run errors).
 *
 * Rendered inside the `[data-catalog-style="legal-paper"]` surface so the
 * paper theme applies. Uses the `.lp-disclaimer` family of classes to stay
 * visually consistent with the rest of the legal demo — same warm off-white
 * background, same red accent, same serif/sans typography contrast.
 *
 * Two variants:
 *   - `variant="error"` — full banner with title + body + docs link. Used
 *     when `onRunErrorEvent` or `onRunFailed` fires.
 *   - `variant="silent"` — single-line hint. Used when the auto-prompt
 *     watcher times out without any agent response.
 *
 * Importantly, this component is positioned ABOVE the surface that
 * `@copilotkit/a2ui-renderer` paints into — so if a partial envelope
 * arrives after the error fires, it still renders cleanly below the banner.
 */

import type { LegalAgentError } from "./use-legal-agent-error";

interface LegalErrorBannerProps {
  variant: "error";
  error: LegalAgentError;
  onDismiss?: () => void;
}

interface LegalSilentBannerProps {
  variant: "silent";
}

type Props = LegalErrorBannerProps | LegalSilentBannerProps;

export function LegalErrorBanner(props: Props) {
  if (props.variant === "silent") {
    return (
      <div
        className="lp-disclaimer text-xs italic mb-4"
        role="status"
        aria-live="polite"
        style={{ textTransform: "none", letterSpacing: "0.01em" }}
      >
        Auto-review attempted but no response was received. Try typing a
        prompt manually in the chat to the left.
      </div>
    );
  }

  const { error, onDismiss } = props;
  const isKnownCheckpointBug = /message\s+not\s+found/i.test(error.message);

  return (
    <div
      className="mb-6 rounded-md border"
      role="alert"
      aria-live="assertive"
      style={{
        background: "rgba(220, 38, 38, 0.06)",
        borderColor: "rgba(220, 38, 38, 0.3)",
        padding: "14px 18px",
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, sans-serif",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p
            className="font-semibold text-sm mb-1"
            style={{ color: "var(--redline-original)" }}
          >
            The agent response couldn{"’"}t reach this chat.
          </p>
          <p
            className="text-sm leading-relaxed mb-2"
            style={{ color: "var(--paper-fg)" }}
          >
            {isKnownCheckpointBug ? (
              <>
                This is a known issue while AG-UI{" "}
                <a
                  href="https://github.com/ag-ui-protocol/ag-ui/pull/570"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                  style={{ color: "var(--paper-fg)" }}
                >
                  #570
                </a>{" "}
                ships upstream. The agent did run — the response just didn
                {"’"}t make it back through the checkpoint.
              </>
            ) : (
              <>
                The agent reported: <em>{error.message}</em>
              </>
            )}
          </p>
          <p className="text-xs" style={{ color: "var(--paper-muted)" }}>
            <a
              href="/docs/troubleshooting.md"
              className="underline"
              style={{ color: "var(--paper-muted)" }}
            >
              See troubleshooting docs
            </a>
            <span aria-hidden="true"> · </span>
            <span>
              Try typing your prompt manually, or restart the legal agent.
            </span>
          </p>
        </div>
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss error"
            className="shrink-0 text-xs px-2 py-1 rounded border"
            style={{
              color: "var(--paper-muted)",
              borderColor: "var(--paper-border)",
              background: "var(--paper-bg)",
            }}
          >
            Dismiss
          </button>
        ) : null}
      </div>
    </div>
  );
}
