/**
 * Realestate Catalog — public entry point.
 *
 * Wires the catalog definitions (schemas) to their React renderers via
 * `createCatalog`. Consumers import `realestateCatalog` and pass it to the
 * A2UI renderer's catalog prop. The string id (`copilotkit://realestate-catalog`)
 * is what the agent references when it emits an envelope that should be
 * rendered against this catalog instead of the default dashboard catalog.
 *
 * Pattern mirrors `src/app/declarative-generative-ui/index.ts` (canonical
 * dashboard catalog), with the catalog id swapped for the legal surface.
 */

import { createCatalog } from "@copilotkit/a2ui-renderer";
import { realestateCatalogDefinitions } from "./definitions";
import { realestateCatalogRenderers } from "./renderers";

export const realestateCatalog = createCatalog(
  realestateCatalogDefinitions,
  realestateCatalogRenderers,
  { catalogId: "copilotkit://realestate-catalog" },
);

export { realestateCatalogDefinitions } from "./definitions";
export type { RealestateCatalogDefinitions } from "./definitions";
