# Homestead — Buyer's Agent

> Magazine-style buyer's-agent copilot for synthetic Brooklyn real-estate
> inventory. The agent surfaces listings, drills into a property with
> comps and schools, schedules a tour, and drafts an offer letter — all
> through declarative A2UI envelopes rendered by a per-example catalog.

---

## Setup

```bash
pnpm dev
```

Then open
[`/other-examples/realestate`](http://localhost:3000/other-examples/realestate)
once the starter is running. The page auto-fires a first prompt
("3BR homes in Brooklyn under $1.5M") so the demo is wow-on-load.

Requires `GEMINI_API_KEY` in your `.env` (same key the dashboard demo uses).

---

## What you'll see

A magazine-style buyer's-agent surface: full-width hero canvas, slide-over
chat panel from the right edge, sage `H` logo mark in a cream tile, warm
taupe / sage / cream / terracotta palette.

The canned demo (75 seconds, 4 prompts):

1. **"3BR homes in Brooklyn under $1.5M"** → `ListingCard` × 3
2. **"Drill into 123 Maple St"** → `ListingDetail` (photo carousel +
   amenities + comps + schools)
3. **"Schedule a tour Saturday afternoon"** → `TourSlotPicker`
4. **"Draft an offer at $1.4M"** → `OfferLetterDraft`

---

## What ships in this example

```
realestate/
├── README.md              (you are here)
├── EXAMPLE.json           (manifest read by the example gallery)
├── catalog/               (Zod schemas + React renderers for the realestate catalog)
│   ├── definitions.ts     (4 widgets + supporting child rows)
│   ├── renderers.tsx      (React components, Fraunces + Inter typography)
│   ├── theme.css          (scoped under [data-catalog-style="realestate"])
│   └── index.ts
├── agent/                 (LangGraph Python package — graph, tools, sample data)
│   ├── pyproject.toml     (populated dependencies — the per-example smoke
│   │                       probe walks this file to decide whether to import)
│   ├── langgraph.json     (standalone — realestate_agent graph entry)
│   └── realestate_agent/
│       ├── graph.py       (Gemini 3.5 Flash via langchain-google-genai)
│       ├── prompts.py     (system prompt — buyer's-agent persona)
│       ├── tools.py       (4 @tool functions — see below)
│       └── data/listings.json (12 synthetic Brooklyn listings + comps,
│                               tour slots, schools)
└── schemas/               (A2UI component trees + fixtures)
    ├── listing_grid.json + .fixture.json
    ├── listing_detail.json + .fixture.json
    ├── tour_slot_picker.json + .fixture.json
    └── offer_letter_draft.json + .fixture.json
```

The Next.js route shim lives at
`src/app/(realestate)/other-examples/realestate/page.tsx`. The
`(realestate)` route-group layout mounts the `realestateCatalog` + the
`realestate` LangGraph agent.

**No `<EnvelopeInspector />`** in this example — by spec. The realestate
example targets buyers, not judges; the magazine surface owns the full
canvas.

---

## Widgets

| Widget                | Triggered by                                | What it shows                                                                  |
| --------------------- | ------------------------------------------- | ------------------------------------------------------------------------------ |
| `ListingCard`         | "Show me 3BR homes under $1.5M"             | Taupe-gradient photo placeholder + address + beds/baths/sqft + price + school rating |
| `ListingDetail`       | "Drill into 123 Maple St"                   | Hero header + amenities chips + room breakdown + 4-row comps table + nearby schools |
| `TourSlotPicker`      | "Schedule a tour Saturday afternoon"        | Day/time grid; booked slots greyed and struck-through; picked slot turns sage  |
| `OfferLetterDraft`    | "Draft an offer at $1.4M"                   | Editable letter body + asking/offer/% summary cells + Send / Revise / Cancel    |

All four use a single shared catalog id: `copilotkit://realestate-catalog`.

---

## Agent tools

The agent (`realestate_agent.graph:graph`) exposes four `@tool` functions:

- **`show_listings(neighborhood, beds_min, max_price, limit)`** — returns a
  `ListingGrid` envelope filtered against the 12 synthetic Brooklyn rows.
- **`show_listing_detail(listing_id, address)`** — full detail surface for
  one listing. Falls back to substring address match when no id is given.
- **`pick_tour_slot(listing_id, day)`** — `TourSlotPicker` for the listing.
  Defaults to the most-recently surfaced listing when no id is passed.
- **`draft_offer_letter(listing_id, offer_amount)`** — buyer's offer letter
  with Send / Revise / Cancel actions. `offer_amount` defaults to 96% of
  asking when omitted.

The agent keeps a tiny in-memory "last surfaced listing" pointer so
follow-up tools work without the user re-stating the listing id.

---

## Synthetic data

All 12 listings (Park Slope, Boerum Hill, Cobble Hill, Carroll Gardens),
comps, schools, and tour slots are fictional. Footer line:
**"Synthetic listings · Brooklyn, NY"**.

If you fork this example for a different market, swap
`agent/realestate_agent/data/listings.json` — the schema is documented in
its header.

---

## Customization tips

- **Re-theme** — every visual rule lives in `catalog/theme.css` (scoped
  under `[data-catalog-style="realestate"]`) and the route shim's sibling
  `realestate.css` (page chrome). Both palettes share the same set of CSS
  custom properties so you can change taupe/sage/cream once and have it
  propagate.
- **Swap demo data** — replace listings.json with your inventory. The
  `_render_listing_card` helper in `tools.py` is the only formatter
  coupling.
- **Add a widget** — copy the `tour_slot_picker.{json,fixture.json}` pair
  for the simplest 5-surface dance: schema + fixture + Zod entry +
  renderer + tool.

---

## Verify

```bash
pnpm validate-widget --examples
pnpm validate-widget other-examples/realestate/schemas/listing_grid.json
pnpm typecheck
pnpm smoke
```

The per-example smoke probe imports `realestate_agent.graph` end-to-end
and reports green when it succeeds.
