import type { BuiltinCollectionDefinition } from "../_types.ts";

export const RETIREMENT_ACCOUNTS: BuiltinCollectionDefinition = {
  name: "retirement_accounts",
  displayName: "Retirement Accounts",
  family: "finance",
  aliases: ["retirement_account","retirement_accounts"],
  fields: [
    { name: "kind", type: "select", options: ["401k","ira_traditional","ira_roth","pension","plan_de_pensiones_es","sep_ira","simple_ira","403b","457","other"] },
    { name: "balance", type: "money" },
    { name: "provider", type: "text" },
    { name: "contributionYtd", type: "money" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "retirement_accounts_kind_idx", fields: ["kind"] },
  ],
};
