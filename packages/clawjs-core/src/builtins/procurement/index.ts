import type { BuiltinFamilyDefinition } from "../_types.ts";

import { SUPPLIERS } from "./suppliers.ts";
import { PURCHASE_ORDERS } from "./purchase_orders.ts";
import { PURCHASE_ORDER_LINE_ITEMS } from "./purchase_order_line_items.ts";

export const PROCUREMENT_FAMILY: BuiltinFamilyDefinition = {
  name: "procurement",
  displayName: "Procurement",
  description: "Suppliers, purchase orders, purchase order lines, receiving status, evidence, and gaps.",
  collections: [
    SUPPLIERS,
    PURCHASE_ORDERS,
    PURCHASE_ORDER_LINE_ITEMS,
  ],
};

export { SUPPLIERS, PURCHASE_ORDERS, PURCHASE_ORDER_LINE_ITEMS };
