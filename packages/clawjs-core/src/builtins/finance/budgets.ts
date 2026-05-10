import type { BuiltinCollectionDefinition } from "../_types.ts";

export const BUDGETS: BuiltinCollectionDefinition = {
  name: "budgets",
  displayName: "Budgets",
  family: "finance",
  aliases: ["budget","budgets"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "period", type: "select", options: ["monthly","weekly","yearly","custom"] },
    { name: "startDate", type: "date" },
    { name: "endDate", type: "date" },
    { name: "totalCents", type: "number" },
    { name: "active", type: "boolean" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "budgets_active_idx", fields: ["active"] },
  ],
};
