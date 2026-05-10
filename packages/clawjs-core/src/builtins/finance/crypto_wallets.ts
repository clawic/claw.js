import type { BuiltinCollectionDefinition } from "../_types.ts";

export const CRYPTO_WALLETS: BuiltinCollectionDefinition = {
  name: "crypto_wallets",
  displayName: "Crypto Wallets",
  family: "finance",
  aliases: ["crypto_wallet","crypto_wallets"],
  fields: [
    { name: "address", type: "text", required: true },
    { name: "chain", type: "text" },
    { name: "label", type: "text" },
    { name: "kind", type: "select", options: ["hot","cold","hardware","exchange","multisig","custodial"] },
    { name: "balanceNative", type: "number" },
    { name: "balanceEquivalent", type: "money" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "crypto_wallets_chain_idx", fields: ["chain"] },
  ],
};
