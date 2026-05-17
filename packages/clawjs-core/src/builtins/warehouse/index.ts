import type { BuiltinFamilyDefinition } from "../_types.ts";

import { WAREHOUSES } from "./warehouses.ts";
import { INVENTORY_ITEMS } from "./inventory_items.ts";
import { STOCK_MOVEMENTS } from "./stock_movements.ts";

export const WAREHOUSE_FAMILY: BuiltinFamilyDefinition = {
  name: "warehouse",
  displayName: "Warehouse / WMS",
  description: "Warehouses, inventory items, stock movements, evidence, quality gaps, and timeline views.",
  collections: [
    WAREHOUSES,
    INVENTORY_ITEMS,
    STOCK_MOVEMENTS,
  ],
};

export { WAREHOUSES, INVENTORY_ITEMS, STOCK_MOVEMENTS };
