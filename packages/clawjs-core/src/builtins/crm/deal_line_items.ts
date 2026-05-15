import type { BuiltinCollectionDefinition } from "../_types.ts";

export const DEAL_LINE_ITEMS: BuiltinCollectionDefinition = {
  name: "deal_line_items",
  displayName: "Deal Line Items",
  family: "crm",
  aliases: ["deal_line","deal_lines","deal_line_item","deal_line_items"],
  fields: [
    { name: "dealId", type: "relation", required: true, relation: { collectionName: "deals" } },
    { name: "productCatalogId", type: "relation", relation: { collectionName: "products_catalog" } },
    { name: "priceId", type: "relation", relation: { collectionName: "prices" } },
    { name: "quantity", type: "number" },
    { name: "discountPercent", type: "number" },
    { name: "amountCents", type: "number", aliases: ["dealLineAmountCents"] },
    { name: "description", type: "text" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "deal_lines_deal_idx", fields: ["dealId"] },
  ],
};
