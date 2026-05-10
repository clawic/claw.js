import type { BuiltinFamilyDefinition } from "../_types.ts";
import { PLANTS } from "./plants.ts";
import { PLANT_CARE_LOGS } from "./plant_care_logs.ts";
import { GARDEN_PLOTS } from "./garden_plots.ts";
import { HARVESTS } from "./harvests.ts";
import { SEEDLINGS } from "./seedlings.ts";

export const GARDEN_FAMILY: BuiltinFamilyDefinition = {
  name: "garden",
  displayName: "Garden & Plants",
  description: "Plants, garden plots, care logs, harvests, seedlings.",
  collections: [PLANTS, PLANT_CARE_LOGS, GARDEN_PLOTS, HARVESTS, SEEDLINGS],
};

export { PLANTS, PLANT_CARE_LOGS, GARDEN_PLOTS, HARVESTS, SEEDLINGS };
