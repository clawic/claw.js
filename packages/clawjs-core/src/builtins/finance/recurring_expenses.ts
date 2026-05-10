import type { BuiltinCollectionDefinition } from "../_types.ts";

export const RECURRING_EXPENSES: BuiltinCollectionDefinition = {
  name: "recurring_expenses",
  displayName: "Recurring Expenses",
  family: "finance",
  aliases: ["recurring_expense","recurring_expenses"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "amountCents", type: "number" },
    { name: "cadence", type: "select", options: ["weekly","monthly","quarterly","yearly"] },
    { name: "categoryId", type: "relation", relation: { collectionName: "budget_categories" } },
    { name: "nextDueAt", type: "date" },
    { name: "active", type: "boolean" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "recurring_expenses_active_idx", fields: ["active"] },
  ],
};
