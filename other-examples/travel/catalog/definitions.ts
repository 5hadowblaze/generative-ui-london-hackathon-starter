/**
 * Travel Catalog — Component Definitions
 *
 * Custom A2UI catalog for the TripWeaver (travel) example. Models a
 * trip-planning surface: flight results, hotel results, day-by-day
 * itinerary, and an email-confirmation card. Mirrors the dashboard
 * catalog's shape (`src/app/declarative-generative-ui/definitions.ts`)
 * so renderers can stay type-checked via
 * `CatalogRenderers<typeof travelCatalogDefinitions>`.
 *
 * Anti-pattern reminder: every prop the agent might want to bind to a
 * data-model path (`{ path: "/flights/0/price" }`) MUST use the DynString
 * union. Declaring a path-bindable field as `z.string()` forces the agent
 * to inline literal text, which means `update_data_model` can't patch it
 * post-render.
 */

import { z } from "zod";

/**
 * Dynamic string: accepts either a literal string or a data-model path
 * binding like `{ path: "/flights/0/airline" }`. The GenericBinder
 * resolves path bindings to the actual value at render time.
 *
 * Pattern lifted verbatim from
 * `src/app/declarative-generative-ui/definitions.ts:19`.
 */
const DynString = z.union([z.string(), z.object({ path: z.string() })]);

/**
 * Action union: lets the agent declare a named event that the renderer
 * dispatches on user interaction (e.g. Select button click).
 * Pattern lifted from
 * `src/app/declarative-generative-ui/definitions.ts:137-148`.
 */
const ActionSchema = z
  .union([
    z.object({
      event: z.object({
        name: z.string(),
        context: z.record(z.any()).optional(),
      }),
    }),
    z.null(),
  ])
  .optional();

export const travelCatalogDefinitions = {
  // ─── Surface root: a scroll-stack column of travel cards. ──────────
  TravelSurface: {
    description:
      "Root container for a TripWeaver surface (flight-results, hotel-results, itinerary-timeline, or email-confirmation). Renders a stacked column with the demo disclaimer pinned at the top of the catalog scope. The headline + sub render in the surface header; children are the cards themselves (FlightCard list, HotelCard list, ItineraryDay list, or a single ConfirmationCard).",
    props: z.object({
      headline: DynString,
      sub: DynString.optional(),
      // Same union as Row/Column in the dashboard catalog — required for
      // GenericBinder to treat this as a template-bound child collection.
      children: z.union([
        z.array(z.string()),
        z.object({ componentId: z.string(), path: z.string() }),
      ]),
    }),
  },

  // ─── FlightCard: one flight result row. ────────────────────────────
  FlightCard: {
    description:
      "Single flight result. Shows airline favicon + airline + flight number, depart/arrive times in mono, duration, stops, and price. The Select button dispatches `select_flight` with the flight id back to the agent.",
    props: z.object({
      airline: DynString,
      airlineLogo: DynString.optional(),
      flightNumber: DynString,
      origin: DynString,
      destination: DynString,
      date: DynString,
      departTime: DynString,
      arriveTime: DynString,
      duration: DynString,
      stops: DynString,
      price: DynString,
      action: ActionSchema,
    }),
  },

  // ─── HotelCard: one hotel result card. ─────────────────────────────
  HotelCard: {
    description:
      "Single hotel result card. Shows photo placeholder, name, neighborhood, star rating, nightly rate. The Select button dispatches `select_hotel` with the hotel id back to the agent.",
    props: z.object({
      name: DynString,
      imageUrl: DynString.optional(),
      neighborhood: DynString,
      rating: DynString.optional(),
      nightlyRate: DynString,
      action: ActionSchema,
    }),
  },

  // ─── ItineraryTimeline: scroll-stack of ItineraryDays. ─────────────
  ItineraryTimeline: {
    description:
      "Vertical day-by-day itinerary timeline. Header shows destination + duration; each child is an ItineraryDay rendering its own items.",
    props: z.object({
      destination: DynString,
      days: DynString,
      children: z.union([
        z.array(z.string()),
        z.object({ componentId: z.string(), path: z.string() }),
      ]),
    }),
  },

  // ─── ItineraryDay: one day in the timeline. ────────────────────────
  ItineraryDay: {
    description:
      "One day of the itinerary timeline. Header shows the day label (e.g. 'Day 1') + a title; children are ItineraryItem rows under it.",
    props: z.object({
      day: DynString,
      title: DynString,
      children: z.union([
        z.array(z.string()),
        z.object({ componentId: z.string(), path: z.string() }),
      ]),
    }),
  },

  // ─── ItineraryItem: one row in an ItineraryDay. ───────────────────
  ItineraryItem: {
    description:
      "Single row in the itinerary timeline. Time appears in mono on the left; title + location in the body; category controls the icon glyph (museum / food / transit / experience / rest).",
    props: z.object({
      time: DynString,
      title: DynString,
      location: DynString.optional(),
      category: z
        .enum(["museum", "food", "transit", "experience", "rest"])
        .optional(),
    }),
  },

  // ─── ConfirmationCard: terminal email-sent card. ──────────────────
  ConfirmationCard: {
    description:
      "Confirmation card for the email-itinerary terminal step. Shows a check glyph, a headline, and a summary line. Demo only — no email is actually sent.",
    props: z.object({
      headline: DynString,
      summary: DynString.optional(),
      recipient: DynString.optional(),
    }),
  },
};

/** Type helper for renderers — enables `CatalogRenderers<typeof ...>` checks. */
export type TravelCatalogDefinitions = typeof travelCatalogDefinitions;
