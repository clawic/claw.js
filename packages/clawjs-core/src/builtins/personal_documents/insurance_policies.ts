import type { BuiltinCollectionDefinition } from "../_types.ts";

export const INSURANCE_POLICIES: BuiltinCollectionDefinition = {
  name: "insurance_policies",
  displayName: "Insurance Policies",
  family: "personal_documents",
  aliases: ["insurance_policy","insurance_policies"],
  fields: [
    { name: "title", type: "text", required: true },
    { name: "kind", type: "select", options: ["home","health","life","travel","personal_liability","renters","other"] },
    { name: "policyNumber", type: "text" },
    { name: "provider", type: "text" },
    { name: "startedAt", type: "date" },
    { name: "expiresAt", type: "date" },
    { name: "premiumCents", type: "number" },
    { name: "coverage", type: "text" },
    { name: "document", type: "file" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "insurance_policies_expires_idx", fields: ["expiresAt"] },
  ],
};
