import type { BuiltinCollectionDefinition } from "../_types.ts";

export const BILLABLE_EXPENSES: BuiltinCollectionDefinition = {
  name: "billable_expenses",
  displayName: "Billable Expenses",
  family: "freelance_consumer",
  aliases: ["billable_expense","billable_expenses"],
  fields: [
    { name: "clientId", type: "relation", relation: { collectionName: "freelance_clients" } },
    { name: "title", type: "text", required: true },
    { name: "incurredAt", type: "date", required: true },
    { name: "amountCents", type: "number" },
    { name: "currency", type: "text" },
    { name: "billable", type: "boolean" },
    { name: "invoiceId", type: "relation", relation: { collectionName: "freelance_invoices" } },
    { name: "receipt", type: "file" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "billable_expenses_client_idx", fields: ["clientId"] },
  ],
};
