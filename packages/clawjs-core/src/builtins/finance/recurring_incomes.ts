import type { BuiltinCollectionDefinition } from "../_types.ts";

export const RECURRING_INCOMES: BuiltinCollectionDefinition = {
  name: "recurring_incomes",
  displayName: "Recurring Incomes",
  family: "finance",
  aliases: ["recurring_income","recurring_incomes"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "amountCents", type: "number" },
    { name: "cadence", type: "select", options: ["weekly","biweekly","monthly","quarterly","yearly"] },
    { name: "source", type: "text" },
    { name: "nextPayoutAt", type: "date" },
    { name: "active", type: "boolean" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "recurring_incomes_active_idx", fields: ["active"] },
  ],
};
