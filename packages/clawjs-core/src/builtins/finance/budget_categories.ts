import type { BuiltinCollectionDefinition } from "../_types.ts";

export const BUDGET_CATEGORIES: BuiltinCollectionDefinition = {
  name: "budget_categories",
  displayName: "Budget Categories",
  family: "finance",
  aliases: ["budget_category","budget_categories"],
  fields: [
    { name: "budgetId", type: "relation", relation: { collectionName: "budgets" } },
    { name: "name", type: "text", required: true },
    { name: "color", type: "text" },
    { name: "icon", type: "text" },
    { name: "plannedCents", type: "number" },
    { name: "kind", type: "select", options: ["expense","income","savings","debt"] },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "budget_categories_budget_idx", fields: ["budgetId"] },
  ],
};
