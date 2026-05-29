/**
 * Travel Catalog — public entry point.
 *
 * Wires the catalog definitions (schemas) to their React renderers via
 * `createCatalog`. Consumers import `travelCatalog` and pass it to the
 * A2UI renderer's catalog prop. The string id (`copilotkit://travel-catalog`)
 * is what the agent references when it emits an envelope that should be
 * rendered against this catalog instead of the default dashboard catalog.
 *
 * Pattern mirrors `src/app/declarative-generative-ui/index.ts` (canonical
 * dashboard catalog), with the catalog id swapped for the travel surface.
 */

import { createCatalog } from "@copilotkit/a2ui-renderer";
import { travelCatalogDefinitions } from "./definitions";
import { travelCatalogRenderers } from "./renderers";

export const travelCatalog = createCatalog(
  travelCatalogDefinitions,
  travelCatalogRenderers,
  { catalogId: "copilotkit://travel-catalog" },
);

export { travelCatalogDefinitions } from "./definitions";
export type { TravelCatalogDefinitions } from "./definitions";
