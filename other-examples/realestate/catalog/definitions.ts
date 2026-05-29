/**
 * Realestate Catalog — Component Definitions
 *
 * Custom A2UI catalog for the Homestead buyer's-agent example. Models a
 * magazine-style real-estate surface: listing grids, full-detail pages
 * with comps + schools, a tour-slot picker, and an editable offer letter.
 * Mirrors the dashboard catalog's shape
 * (`src/app/declarative-generative-ui/definitions.ts`) so renderers can
 * stay type-checked via `CatalogRenderers<typeof realestateCatalogDefinitions>`.
 *
 * Anti-pattern reminder: every prop the agent might want to bind to a
 * data-model path (`{ path: "/listings/0/address" }`) MUST use the
 * DynString union. Declaring a path-bindable field as `z.string()` forces
 * the agent to inline literal text, which means `update_data_model` can't
 * patch it post-render — interactive round-trips would freeze.
 */

import { z } from "zod";

/**
 * Dynamic string: accepts either a literal string or a data-model path
 * binding like `{ path: "/listings/0/address" }`. The GenericBinder
 * resolves path bindings to the actual value at render time.
 *
 * Pattern lifted verbatim from
 * `src/app/declarative-generative-ui/definitions.ts:19`.
 */
const DynString = z.union([z.string(), z.object({ path: z.string() })]);

/**
 * Action union: lets the agent declare a named event that the renderer
 * dispatches on user interaction (e.g. View details / Schedule tour
 * click). Pattern lifted from
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

export const realestateCatalogDefinitions = {
  /**
   * Root grid container for ListingCard rows. Renders a magazine-style
   * "Results" header (filter summary + count) above a responsive grid of
   * `children`. Apply at the root of any listing-search surface.
   */
  ListingGrid: {
    description:
      "Root container for a Homestead listing grid. Renders a magazine-style filter summary header followed by a responsive grid of ListingCard children. `children` MUST be a template binding ({ componentId, path }) so the renderer iterates the data model.",
    props: z.object({
      filterSummary: DynString.optional(),
      children: z.union([
        z.array(z.string()),
        z.object({ componentId: z.string(), path: z.string() }),
      ]),
    }),
  },

  /**
   * Property listing card — photo placeholder, beds/baths/sqft, price,
   * neighborhood, school rating, status. Every text prop is path-bound
   * via DynString so the agent can resend `update_data_model` without
   * resending `update_components`.
   */
  ListingCard: {
    description:
      "A single Brooklyn listing card. Displays a taupe-gradient photo placeholder, address, neighborhood, beds/baths/sqft, price + price-per-sqft, school rating, and an Active/Pending/Sold status dot. Use inside a ListingGrid. `action` (optional) dispatches a 'view_listing_details' event when the View details button is clicked.",
    props: z.object({
      address: DynString,
      neighborhood: DynString,
      beds: DynString,
      baths: DynString,
      sqft: DynString,
      price: DynString,
      pricePerSqft: DynString,
      propertyType: DynString,
      schoolRating: DynString,
      status: DynString,
      action: ActionSchema,
    }),
  },

  /**
   * Full listing-detail surface — hero header, amenities, rooms, comps
   * table, nearby schools. The "photo carousel" is currently a taupe
   * gradient with cycling captions (synthetic data — we don't ship real
   * photos). All template-bound child collections use the `{ componentId,
   * path }` union so the agent can swap out a comp row or amenity chip
   * via `update_data_model` later.
   */
  ListingDetail: {
    description:
      "Root container for a single Brooklyn listing's detail page. Magazine-style hero header (gradient photo carousel + address + price), then amenities chips, room breakdown, recent comps table, and nearby schools. Wire the four child collections (amenitiesChildren, roomsChildren, compsChildren, schoolsChildren) as template bindings so the agent can mutate them post-render.",
    props: z.object({
      // Header / hero
      address: DynString,
      neighborhood: DynString,
      price: DynString,
      pricePerSqft: DynString,
      propertyType: DynString,
      status: DynString,
      beds: DynString,
      baths: DynString,
      sqft: DynString,
      yearBuilt: DynString.optional(),
      schoolRating: DynString.optional(),
      listingAgent: DynString.optional(),
      notes: DynString.optional(),
      // Child collections
      amenitiesChildren: z.union([
        z.array(z.string()),
        z.object({ componentId: z.string(), path: z.string() }),
      ]),
      roomsChildren: z.union([
        z.array(z.string()),
        z.object({ componentId: z.string(), path: z.string() }),
      ]),
      compsChildren: z.union([
        z.array(z.string()),
        z.object({ componentId: z.string(), path: z.string() }),
      ]),
      schoolsChildren: z.union([
        z.array(z.string()),
        z.object({ componentId: z.string(), path: z.string() }),
      ]),
      // Header actions
      tourAction: ActionSchema,
      offerAction: ActionSchema,
    }),
  },

  /**
   * Amenity chip — one of the chips in the ListingDetail amenities row.
   */
  AmenityChip: {
    description:
      "Pill-shaped amenity tag rendered as part of a ListingDetail's amenities row (e.g. 'Garden access', 'Renovated kitchen 2024').",
    props: z.object({
      label: DynString,
    }),
  },

  /**
   * Room breakdown row — label + detail pair.
   */
  RoomRow: {
    description:
      "Room breakdown row in a ListingDetail. Two-column layout: room label on the left, detail blurb on the right (e.g. 'Parlor floor — Living + dining + parlor fireplace').",
    props: z.object({
      label: DynString,
      detail: DynString,
    }),
  },

  /**
   * Comparable-sales row — recent sold address with beds/baths/sqft and
   * sold price.
   */
  CompRow: {
    description:
      "Recent-comp row in a ListingDetail's comps table. Address + beds/baths/sqft + sold price + price-per-sqft + sold date. Renders as a single row of a paper-styled comps table.",
    props: z.object({
      address: DynString,
      soldPrice: DynString,
      beds: DynString,
      baths: DynString,
      sqft: DynString,
      pricePerSqft: DynString,
      soldDate: DynString,
    }),
  },

  /**
   * Nearby school row — name, level, rating, distance.
   */
  SchoolRow: {
    description:
      "Nearby-school row in a ListingDetail. Shows the school name, education level, sage-tinted rating pill, and walking distance.",
    props: z.object({
      name: DynString,
      level: DynString,
      rating: DynString,
      distance: DynString,
    }),
  },

  /**
   * Tour slot picker — day/time grid for a single listing.
   */
  TourSlotPicker: {
    description:
      "Tour-slot picker for a single Brooklyn listing. Renders the listing header (address + neighborhood) above a grouped day/time grid of TourSlot children. Wire `slotsChildren` as a template binding so the agent can repaint availability via update_data_model.",
    props: z.object({
      address: DynString,
      neighborhood: DynString,
      slotsChildren: z.union([
        z.array(z.string()),
        z.object({ componentId: z.string(), path: z.string() }),
      ]),
    }),
  },

  /**
   * Single tour slot — day + time + availability + action.
   */
  TourSlot: {
    description:
      "A single tour-slot button inside a TourSlotPicker. Day + time pill; disabled when `available` is the literal string 'false'. Clicking dispatches a 'tour_slot_selected' event carrying listingId + day + time.",
    props: z.object({
      day: DynString,
      time: DynString,
      available: DynString,
      action: ActionSchema,
    }),
  },

  /**
   * Offer letter draft — editable text card with Send / Revise / Cancel
   * action buttons.
   */
  OfferLetterDraft: {
    description:
      "Buyer's offer-letter draft surface. Renders the listing header (address + asking + offer + % of asking), an editable letter body (read-only display in this demo — the textarea is wired for future iteration), and Send / Revise / Cancel action buttons. Actions emit 'send_offer', 'revise_offer', 'cancel_offer' events with the offer context.",
    props: z.object({
      address: DynString,
      neighborhood: DynString,
      askingPrice: DynString,
      offerAmount: DynString,
      pctOfAsking: DynString,
      letter: DynString,
      sendAction: ActionSchema,
      reviseAction: ActionSchema,
      cancelAction: ActionSchema,
    }),
  },
};

/** Type helper for renderers — enables `CatalogRenderers<typeof ...>` checks. */
export type RealestateCatalogDefinitions = typeof realestateCatalogDefinitions;
