# TripWeaver — Travel Copilot

A trip-planning copilot. The agent surfaces flight cards, hotel cards,
and a day-by-day itinerary timeline as the user chats. Built as a
sub-repo under `/other-examples/` to demonstrate a fully bespoke A2UI
catalog (`copilotkit://travel-catalog`) and a dedicated route group with
a distinct visual identity from the dashboard demo.

---

## Setup

Open [`/other-examples/travel`](http://localhost:3000/other-examples/travel)
in the browser once the starter is running.

Requires `GEMINI_API_KEY` in your `.env`. The runtime mounts a `travel`
agent that hits the LangGraph deployment at
`other-examples/travel/agent/travel_agent/graph.py:graph`. You may need
to run a sibling `langgraph dev` server registering that graph — see
the parent repo's `HACKATHON.md`.

---

## What you'll see

- **Header** — TripWeaver wordmark (solid sky-deep with a coral
  underline accent; NOT a transparent-fill gradient — that pattern
  broke in the prototype) + plane glyph.
- **Chat panel** pinned to the top of the viewport.
- **Suggestion chips** for the four canned demo prompts so the first
  prompt isn't a blank page.
- **Scroll-stack surface column** below the chat. New A2UI surfaces
  slide in at 200ms as the agent emits them.
- **Sticky bottom toolbar** showing a synthetic trip summary
  (LHR → JFK, dates, traveler count) and the disclaimer.

There is **no envelope inspector** on this route — the four polished
examples are a different demo modality from the dashboard surface
where the inspector is load-bearing.

---

## The four widgets

| Component             | Surface             | Shape                                                   |
| --------------------- | ------------------- | ------------------------------------------------------- |
| `FlightCard`          | `flight-results`    | Airline logo + flight no, depart/arrive times, price.   |
| `HotelCard`           | `hotel-results`     | Photo, name, rating, neighborhood, nightly rate.        |
| `ItineraryTimeline`   | `itinerary-timeline`| Day-by-day stack of `ItineraryDay` containers.          |
| `ItineraryItem`       | (inside Day)        | One row: time, title, location, category icon.          |
| `ConfirmationCard`    | `email-confirmation`| Terminal "email sent" card with check glyph.            |

`ItineraryTimeline` + `ItineraryDay` + `ItineraryItem` form a single
visual unit; the schema describes a 3-level tree (timeline → days → items)
backed by the data model in `agent/travel_agent/data/synthetic.py`.

The visual structure of `ItineraryDay` was ported from the a2a-travel
showcase's `ItineraryCard.tsx` (day header pill + body grouping). Colors
and fonts are TripWeaver's; the markup shape is the borrow.

---

## Canned demo (4 prompts)

1. "Find flights LHR to JFK next Wednesday under $700." → 3 FlightCards
2. "Hotels near Times Square under $300." → 3 HotelCards
3. "Build me a 3-day NYC itinerary with an art-museum focus." → ItineraryTimeline
4. "Email it to me." → ConfirmationCard

All inventory is synthetic. Footer disclaimer: "Demo · synthetic prices
· not bookable."

---

## Layout

```
travel/
├── README.md         (you are here)
├── EXAMPLE.json      (manifest read by the example gallery)
├── catalog/          (Zod schemas + React renderers for TravelSurface, FlightCard, HotelCard, Itinerary*, ConfirmationCard)
├── agent/            (LangGraph Python package — graph, tools, synthetic data)
└── schemas/          (component-tree adjacency lists + test fixtures)
```

The Next.js route lives at `src/app/(travel)/other-examples/travel/page.tsx`
as a thin shim that imports from this folder. The `(travel)` route group
also provides `layout.tsx` mounting `<CopilotKit>` with the TripWeaver
catalog + the `travel` agent.

---

## Fork notes — what's portable

This folder is a **content unit**, not a build-system unit. If you fork
into a new repo you also need:

1. The parent's exact `@copilotkit/*` pins (`package.json`).
2. A working `src/app/api/copilotkit/[[...slug]]/route.ts` shell with
   the `travel` agent registered.
3. The route-group `layout.tsx` that mounts `<CopilotKit>`.
4. Tailwind 4 + `globals.css` + `ThemeProvider`.
5. A `langgraph.json` entry (or its own dev langgraph server) loading
   `other-examples/travel/agent/travel_agent/graph.py:graph`.
6. Pinned Python deps from `agent/pyproject.toml`.

---

## Disclaimer

**Demo only — synthetic prices, not bookable.** The airlines, hotels,
itinerary items, and dates are fabricated. Do not use the output of
this example to plan a real trip.
