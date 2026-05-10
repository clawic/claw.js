import type { BuiltinCollectionDefinition } from "../_types.ts";

export const CRYPTO_HOLDINGS: BuiltinCollectionDefinition = {
  name: "crypto_holdings",
  displayName: "Crypto Holdings",
  family: "finance",
  aliases: ["crypto_holding","crypto_holdings"],
  fields: [
    { name: "walletId", type: "relation", relation: { collectionName: "crypto_wallets" } },
    { name: "symbol", type: "text", required: true },
    { name: "quantity", type: "number" },
    { name: "averageCost", type: "money" },
    { name: "currentPrice", type: "money" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "crypto_holdings_symbol_idx", fields: ["symbol"] },
  ],
};
