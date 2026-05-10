import type { BuiltinCollectionDefinition } from "../_types.ts";

export const SAVINGS_GOALS: BuiltinCollectionDefinition = {
  name: "savings_goals",
  displayName: "Savings Goals",
  family: "finance",
  aliases: ["savings_goal","savings_goals"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "targetCents", type: "number" },
    { name: "currentCents", type: "number" },
    { name: "targetDate", type: "date" },
    { name: "currency", type: "text" },
    { name: "accountId", type: "relation", relation: { collectionName: "financial_accounts" } },
    { name: "status", type: "select", options: ["active","completed","paused","abandoned"] },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "savings_goals_status_idx", fields: ["status"] },
  ],
};
