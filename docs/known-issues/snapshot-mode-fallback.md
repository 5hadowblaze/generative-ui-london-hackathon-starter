# Snapshot-mode fallback (design sketch, NOT IMPLEMENTED)

This is a 1-page proposal for a `?mode=snapshot` query parameter on the
legal-contract-review page that bypasses the agent entirely and renders
the canonical contract surface directly from
`other-examples/legal-contract-review/schemas/contract_review.fixture.json`.

The mode is a **demo-day insurance policy**, not a production feature. It
exists so that if the AG-UI upstream regression resurfaces (or any other
agent-side bug breaks the live demo on hackathon day), the operator can
still show the headline visual.

## Trigger

URL: `/other-examples/legal-contract-review?mode=snapshot`

When the page detects `?mode=snapshot`:

1. Skip `useAgent` entirely (no agent subscription, no auto-prompt).
2. Render the surface from the static fixture via the same
   `legalPaperCatalog` renderers, so the visual is byte-identical to the
   live agent's output for that specific document.
3. Add a small banner ("Demo snapshot — agent disabled") so judges /
   viewers know they're seeing the fallback.

## Implementation sketch (NOT a diff)

```tsx
// src/app/(legal)/other-examples/legal-contract-review/page.tsx
"use client";

import { useSearchParams } from "next/navigation";
import contractReviewFixture from "../../../../../other-examples/legal-contract-review/schemas/contract_review.fixture.json";

export default function LegalContractReviewPage() {
  const params = useSearchParams();
  const snapshotMode = params.get("mode") === "snapshot";

  if (snapshotMode) {
    return <SnapshotSurface envelope={contractReviewFixture} />;
  }
  // ...existing live-agent path
}

function SnapshotSurface({ envelope }: { envelope: unknown }) {
  // Mount the same a2ui catalog + theme, but feed the fixture into the
  // renderer directly (bypassing the agent subscription). The catalog
  // renderers don't care whether the envelope came from the wire or a
  // bundled JSON file.
  return (
    <div data-catalog-style="legal-paper">
      <SnapshotBanner />
      <CatalogRenderer envelope={envelope} catalog={legalPaperCatalog} />
    </div>
  );
}
```

The actual implementation needs:

- A mechanism to feed a static envelope into the A2UI renderer
  outside the agent subscription. This may require either:
  - A new exported entry point from `@copilotkit/a2ui-renderer`
    (`renderEnvelope(envelope, catalog)`), OR
  - Wrapping the renderer in a minimal "fake agent" that emits the
    fixture as a one-shot event on mount.
- A subtle banner indicating snapshot mode, themed to fit the paper
  surface.

## Trade-offs

- **Pros:** demo-day safety net. Even if every agent path is broken,
  the visual still ships.
- **Cons:** the static fixture won't show interactive redlines
  (accept/reject events have nothing to send to). If the hackathon
  needs a working interactive demo, snapshot mode is not the answer
  — the live-agent path must work.

## When to build this

Only build snapshot mode if:

1. The live-agent path remains unreliable 24h before the hackathon,
   AND
2. We've decided that "show the visual without interactivity" is more
   valuable than the time it would take to keep debugging the live
   path.

Otherwise, this stays a sketch.

## Estimated effort

~2 hours (small) — one file edit, plus a tiny "fake-agent" wrapper or
a renderer exposure that takes an envelope directly.
