import type { BuiltinCollectionDefinition } from "../_types.ts";

export const CONTRACTS_PERSONAL: BuiltinCollectionDefinition = {
  name: "contracts_personal",
  displayName: "Contracts",
  family: "personal_documents",
  aliases: ["contract_personal","contracts_personal","contract"],
  fields: [
    { name: "title", type: "text", required: true },
    { name: "counterparty", type: "text" },
    { name: "signedAt", type: "date" },
    { name: "expiresAt", type: "date" },
    { name: "kind", type: "select", options: ["lease","service","employment","freelance","loan","other"] },
    { name: "document", type: "file" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "contracts_personal_expires_idx", fields: ["expiresAt"] },
  ],
};
