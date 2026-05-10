import type { BuiltinCollectionDefinition } from "../_types.ts";

export const INVOICES: BuiltinCollectionDefinition = {
  name: "invoices",
  displayName: "Invoices",
  family: "billing",
  aliases: ["invoice","invoices"],
  fields: [
    { name: "billingCustomerId", type: "relation", required: true, relation: { collectionName: "billing_customers" } },
    { name: "subscriptionId", type: "relation", relation: { collectionName: "subscriptions" } },
    { name: "number", type: "text" },
    { name: "totalCents", type: "number" },
    { name: "subtotalCents", type: "number" },
    { name: "taxCents", type: "number" },
    { name: "currency", type: "text" },
    { name: "status", type: "select", required: true, options: ["draft","open","paid","void","uncollectible"] },
    { name: "paid", type: "boolean" },
    { name: "periodStart", type: "date" },
    { name: "periodEnd", type: "date" },
    { name: "dueDate", type: "date" },
    { name: "hostedInvoiceUrl", type: "text" },
    { name: "pdfUrl", type: "text" },
    { name: "attemptCount", type: "number" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "invoices_customer_idx", fields: ["billingCustomerId"] },
    { name: "invoices_status_idx", fields: ["status"] },
    { name: "invoices_number_unique", fields: ["number"], unique: true },
  ],
};
