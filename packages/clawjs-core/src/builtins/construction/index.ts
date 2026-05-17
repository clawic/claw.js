import type { BuiltinFamilyDefinition } from "../_types.ts";

import { CONSTRUCTION_PROJECTS } from "./construction_projects.ts";
import { CONSTRUCTION_SITES } from "./construction_sites.ts";
import { CONSTRUCTION_RFIS } from "./construction_rfis.ts";
import { CONSTRUCTION_CHANGE_ORDERS } from "./construction_change_orders.ts";

export const CONSTRUCTION_FAMILY: BuiltinFamilyDefinition = {
  name: "construction",
  displayName: "Construction",
  description: "Construction projects, sites, RFIs, change orders, evidence, schedule/cost impact, and gaps.",
  collections: [
    CONSTRUCTION_PROJECTS,
    CONSTRUCTION_SITES,
    CONSTRUCTION_RFIS,
    CONSTRUCTION_CHANGE_ORDERS,
  ],
};

export { CONSTRUCTION_PROJECTS, CONSTRUCTION_SITES, CONSTRUCTION_RFIS, CONSTRUCTION_CHANGE_ORDERS };
