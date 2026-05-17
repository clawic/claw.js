import type { BuiltinFamilyDefinition } from "../_types.ts";

import { SUPPLY_PLANS } from "./supply_plans.ts";
import { SUPPLY_PLAN_ITEMS } from "./supply_plan_items.ts";
import { SUPPLY_RISKS } from "./supply_risks.ts";

export const SUPPLY_CHAIN_FAMILY: BuiltinFamilyDefinition = {
  name: "supply_chain",
  displayName: "Supply Chain / SCM",
  description: "Supply plans, supply-plan items, risks, supplier/procurement/warehouse links, evidence, and gaps.",
  collections: [
    SUPPLY_PLANS,
    SUPPLY_PLAN_ITEMS,
    SUPPLY_RISKS,
  ],
};

export { SUPPLY_PLANS, SUPPLY_PLAN_ITEMS, SUPPLY_RISKS };
