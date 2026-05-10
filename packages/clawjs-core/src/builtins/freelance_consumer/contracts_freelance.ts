import type { BuiltinCollectionDefinition } from "../_types.ts";

export const CONTRACTS_FREELANCE: BuiltinCollectionDefinition = {
  name: "contracts_freelance",
  displayName: "Freelance Contracts",
  family: "freelance_consumer",
  aliases: ["contract_freelance","contracts_freelance"],
  fields: [
    { name: "clientId", type: "relation", required: true, relation: { collectionName: "freelance_clients" } },
    { name: "title", type: "text", required: true },
    { name: "signedAt", type: "date" },
    { name: "startedAt", type: "date" },
    { name: "endedAt", type: "date" },
    { name: "totalCents", type: "number" },
    { name: "currency", type: "text" },
    { name: "status", type: "select", options: ["draft","active","completed","terminated"] },
    { name: "document", type: "file" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "contracts_freelance_status_idx", fields: ["status"] },
  ],
};
