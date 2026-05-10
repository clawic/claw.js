import type { BuiltinFamilyDefinition } from "../_types.ts";
import { ANTIQUES_INVENTORY } from "./antiques_inventory.ts";
import { ASTRONOMY_OBSERVATIONS } from "./astronomy_observations.ts";
import { BEER_LOG } from "./beer_log.ts";
import { BIRDWATCHING_SIGHTINGS } from "./birdwatching_sightings.ts";
import { CIGARS } from "./cigars.ts";
import { COCKTAILS_RECIPES } from "./cocktails_recipes.ts";
import { FISHING_CATCHES } from "./fishing_catches.ts";
import { GEOCACHING_FINDS } from "./geocaching_finds.ts";
import { HUNTING_LOG } from "./hunting_log.ts";
import { JEWELRY_ITEMS } from "./jewelry_items.ts";
import { SPIRITS_COLLECTION } from "./spirits_collection.ts";
import { WATCHES } from "./watches.ts";
import { WINE_CELLAR_BOTTLES } from "./wine_cellar_bottles.ts";

export const LUXURY_AND_COLLECTING_FAMILY: BuiltinFamilyDefinition = {
  name: "luxury_and_collecting",
  displayName: "Luxury & Collecting",
  description: "Watches, jewelry, wine cellar, beer, spirits, cigars, fishing, hunting, geocaching, birdwatching, astronomy, antiques.",
  collections: [ANTIQUES_INVENTORY, ASTRONOMY_OBSERVATIONS, BEER_LOG, BIRDWATCHING_SIGHTINGS, CIGARS, COCKTAILS_RECIPES, FISHING_CATCHES, GEOCACHING_FINDS, HUNTING_LOG, JEWELRY_ITEMS, SPIRITS_COLLECTION, WATCHES, WINE_CELLAR_BOTTLES],
};

export { ANTIQUES_INVENTORY, ASTRONOMY_OBSERVATIONS, BEER_LOG, BIRDWATCHING_SIGHTINGS, CIGARS, COCKTAILS_RECIPES, FISHING_CATCHES, GEOCACHING_FINDS, HUNTING_LOG, JEWELRY_ITEMS, SPIRITS_COLLECTION, WATCHES, WINE_CELLAR_BOTTLES };
