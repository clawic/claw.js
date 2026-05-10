import type { BuiltinCollectionDefinition } from "../_types.ts";

export const INVESTMENT_TRANSACTIONS: BuiltinCollectionDefinition = {
  name: "investment_transactions",
  displayName: "Investment Transactions",
  family: "finance",
  aliases: ["investment_transaction","investment_transactions"],
  fields: [
    { name: "holdingId", type: "relation", relation: { collectionName: "investment_holdings" } },
    { name: "tradedAt", type: "date", required: true },
    { name: "kind", type: "select", options: ["buy","sell","dividend","split","fee"] },
    { name: "quantity", type: "number" },
    { name: "priceCents", type: "number" },
    { name: "feeCents", type: "number" },
    { name: "currency", type: "text" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "investment_transactions_traded_idx", fields: ["tradedAt"] },
  ],
};
