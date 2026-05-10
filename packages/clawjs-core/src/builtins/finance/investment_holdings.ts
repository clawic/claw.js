import type { BuiltinCollectionDefinition } from "../_types.ts";

export const INVESTMENT_HOLDINGS: BuiltinCollectionDefinition = {
  name: "investment_holdings",
  displayName: "Investment Holdings",
  family: "finance",
  aliases: ["investment_holding","investment_holdings","holding"],
  fields: [
    { name: "symbol", type: "text", required: true },
    { name: "name", type: "text", required: true },
    { name: "assetClass", type: "select", options: ["stock","etf","fund","crypto","bond","commodity","real_estate","other"] },
    { name: "quantity", type: "number" },
    { name: "averageCostCents", type: "number" },
    { name: "currentPriceCents", type: "number" },
    { name: "currency", type: "text" },
    { name: "accountId", type: "relation", relation: { collectionName: "financial_accounts" } },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "investment_holdings_symbol_idx", fields: ["symbol"] },
    { name: "investment_holdings_asset_idx", fields: ["assetClass"] },
  ],
};
