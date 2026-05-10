import type { BuiltinCollectionDefinition } from "../_types.ts";

export const BILLS: BuiltinCollectionDefinition = {
  name: "bills",
  displayName: "Bills",
  family: "finance",
  aliases: ["bill","bills"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "amountCents", type: "number" },
    { name: "currency", type: "text" },
    { name: "dueAt", type: "date", required: true },
    { name: "status", type: "select", options: ["pending","paid","overdue","scheduled","disputed"] },
    { name: "accountId", type: "relation", relation: { collectionName: "financial_accounts" } },
    { name: "categoryId", type: "relation", relation: { collectionName: "budget_categories" } },
    { name: "recurring", type: "boolean" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "bills_due_idx", fields: ["dueAt"] },
    { name: "bills_status_idx", fields: ["status"] },
  ],
};
