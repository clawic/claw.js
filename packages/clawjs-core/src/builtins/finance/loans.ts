import type { BuiltinCollectionDefinition } from "../_types.ts";

export const LOANS: BuiltinCollectionDefinition = {
  name: "loans",
  displayName: "Loans",
  family: "finance",
  aliases: ["loan","loans"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "lender", type: "text" },
    { name: "kind", type: "select", options: ["mortgage","auto","student","personal","business","other"] },
    { name: "principalCents", type: "number" },
    { name: "remainingCents", type: "number" },
    { name: "interestRate", type: "number" },
    { name: "monthlyPaymentCents", type: "number" },
    { name: "startedAt", type: "date" },
    { name: "endsAt", type: "date" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "loans_kind_idx", fields: ["kind"] },
  ],
};
