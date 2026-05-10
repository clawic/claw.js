import type { BuiltinCollectionDefinition } from "../_types.ts";

export const TRUST_FUNDS: BuiltinCollectionDefinition = {
  name: "trust_funds",
  displayName: "Trust Funds",
  family: "finance",
  aliases: ["trust_fund","trust_funds"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "trustee", type: "text" },
    { name: "beneficiaries", type: "text" },
    { name: "balance", type: "money" },
    { name: "startedAt", type: "date" },
    { name: "status", type: "select", options: ["active","revocable","irrevocable","dissolved","pending"] },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "trust_funds_status_idx", fields: ["status"] },
  ],
};
