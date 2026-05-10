import type { BuiltinCollectionDefinition } from "../_types.ts";

export const DEBTS: BuiltinCollectionDefinition = {
  name: "debts",
  displayName: "Debts",
  family: "finance",
  aliases: ["debt","debts"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "creditor", type: "text" },
    { name: "principalCents", type: "number" },
    { name: "remainingCents", type: "number" },
    { name: "interestRate", type: "number" },
    { name: "startedAt", type: "date" },
    { name: "dueAt", type: "date" },
    { name: "status", type: "select", options: ["active","paid_off","in_collection","settled"] },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "debts_status_idx", fields: ["status"] },
  ],
};
