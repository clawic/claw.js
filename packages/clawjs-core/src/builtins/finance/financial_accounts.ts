import type { BuiltinCollectionDefinition } from "../_types.ts";

export const FINANCIAL_ACCOUNTS: BuiltinCollectionDefinition = {
  name: "financial_accounts",
  displayName: "Financial Accounts",
  family: "finance",
  aliases: ["financial_account","financial_accounts","account"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "kind", type: "select", options: ["checking","savings","credit_card","cash","investment","loan","wallet","other"] },
    { name: "institution", type: "text" },
    { name: "currency", type: "text" },
    { name: "balanceCents", type: "number" },
    { name: "active", type: "boolean" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "financial_accounts_kind_idx", fields: ["kind"] },
    { name: "financial_accounts_active_idx", fields: ["active"] },
  ],
};
