import type { BuiltinCollectionDefinition } from "../_types.ts";

export const PRAISE: BuiltinCollectionDefinition = {
  name: "praise",
  displayName: "Praise / Recognition",
  family: "hr",
  aliases: ["kudos","praise"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "recipientActorId", type: "relation", required: true, relation: { collectionName: "actors" } },
    { name: "giverActorId", type: "relation", relation: { collectionName: "actors" } },
    { name: "message", type: "text" },
    { name: "value", type: "json" },
    { name: "public", type: "boolean" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "praise_company_idx", fields: ["companyId"] },
    { name: "praise_recipient_idx", fields: ["recipientActorId"] },
  ],
};
