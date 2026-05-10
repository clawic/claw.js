import type { BuiltinFamilyDefinition } from "../_types.ts";
import { HOME_INVENTORY_ITEMS } from "./home_inventory_items.ts";
import { APPLIANCES } from "./appliances.ts";
import { APPLIANCE_MAINTENANCE } from "./appliance_maintenance.ts";
import { CHORES } from "./chores.ts";
import { CHORE_LOGS } from "./chore_logs.ts";
import { HOUSEHOLDS } from "./households.ts";
import { HOUSEHOLD_MEMBERS } from "./household_members.ts";
import { WARRANTIES } from "./warranties.ts";
import { MANUALS } from "./manuals.ts";

export const POSSESSIONS_FAMILY: BuiltinFamilyDefinition = {
  name: "possessions",
  displayName: "Home & Possessions",
  description: "Home inventory, appliances, maintenance, chores, warranties.",
  collections: [HOME_INVENTORY_ITEMS, APPLIANCES, APPLIANCE_MAINTENANCE, CHORES, CHORE_LOGS, HOUSEHOLDS, HOUSEHOLD_MEMBERS, WARRANTIES, MANUALS],
};

export { HOME_INVENTORY_ITEMS, APPLIANCES, APPLIANCE_MAINTENANCE, CHORES, CHORE_LOGS, HOUSEHOLDS, HOUSEHOLD_MEMBERS, WARRANTIES, MANUALS };
