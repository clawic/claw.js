import type { BuiltinCollectionDefinition } from "../_types.ts";

export const QUOTE_LINE_ITEMS: BuiltinCollectionDefinition = {
  name: "quote_line_items",
  displayName: "Quote Line Items",
  family: "crm",
  aliases: ["quote_line","quote_lines","quote_line_item","quote_line_items"],
  fields: [
    { name: "quoteId", type: "relation", required: true, relation: { collectionName: "quotes" } },
    { name: "productCatalogId", type: "relation", relation: { collectionName: "products_catalog" } },
    { name: "priceId", type: "relation", relation: { collectionName: "prices" } },
    { name: "quantity", type: "number" },
    { name: "unitAmountCents", type: "number" },
    { name: "discountPercent", type: "number" },
    { name: "description", type: "text" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "quote_lines_quote_idx", fields: ["quoteId"] },
  ],
};
