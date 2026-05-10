import type { BuiltinCollectionDefinition } from "../_types.ts";

export const ORDER_LINE_ITEMS: BuiltinCollectionDefinition = {
  name: "order_line_items",
  displayName: "Order Line Items",
  family: "commerce",
  aliases: ["order_line","order_lines","order_line_item","order_line_items"],
  fields: [
    { name: "orderId", type: "relation", required: true, relation: { collectionName: "orders" } },
    { name: "productCatalogId", type: "relation", relation: { collectionName: "products_catalog" } },
    { name: "productVariantId", type: "relation", relation: { collectionName: "product_variants" } },
    { name: "quantity", type: "number" },
    { name: "unitAmountCents", type: "number" },
    { name: "discountCents", type: "number" },
    { name: "description", type: "text" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "order_lines_order_idx", fields: ["orderId"] },
  ],
};
