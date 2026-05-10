import type { BuiltinFamilyDefinition } from "../_types.ts";

import { PRODUCT_VARIANTS } from "./product_variants.ts";
import { ORDERS } from "./orders.ts";
import { ORDER_LINE_ITEMS } from "./order_line_items.ts";
import { SHOPPING_CARTS } from "./shopping_carts.ts";

export const COMMERCE_FAMILY: BuiltinFamilyDefinition = {
  name: "commerce",
  displayName: "Commerce",
  description: "Product variants, orders with line items and shopping carts.",
  collections: [
    PRODUCT_VARIANTS,
    ORDERS,
    ORDER_LINE_ITEMS,
    SHOPPING_CARTS,
  ],
};

export { PRODUCT_VARIANTS, ORDERS, ORDER_LINE_ITEMS, SHOPPING_CARTS };
