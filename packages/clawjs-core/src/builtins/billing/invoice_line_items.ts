import type { BuiltinCollectionDefinition } from "../_types.ts";

export const INVOICE_LINE_ITEMS: BuiltinCollectionDefinition = {
  name: "invoice_line_items",
  displayName: "Invoice Line Items",
  family: "billing",
  aliases: ["invoice_line","invoice_lines","invoice_line_item","invoice_line_items"],
  fields: [
    { name: "invoiceId", type: "relation", required: true, relation: { collectionName: "invoices" } },
    { name: "description", type: "text" },
    { name: "amountCents", type: "number", aliases: ["invoiceLineAmountCents"] },
    { name: "quantity", type: "number" },
    { name: "priceId", type: "relation", relation: { collectionName: "prices" } },
    { name: "subscriptionItemId", type: "relation", relation: { collectionName: "subscription_items" } },
    { name: "periodStart", type: "date" },
    { name: "periodEnd", type: "date" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "invoice_lines_invoice_idx", fields: ["invoiceId"] },
  ],
};
