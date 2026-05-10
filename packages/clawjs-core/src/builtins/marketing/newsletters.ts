import type { BuiltinCollectionDefinition } from "../_types.ts";

export const NEWSLETTERS: BuiltinCollectionDefinition = {
  name: "newsletters",
  displayName: "Newsletters",
  family: "marketing",
  aliases: ["newsletter","newsletters"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "name", type: "text", required: true },
    { name: "slug", type: "text", required: true },
    { name: "description", type: "text" },
    { name: "senderEmail", type: "email" },
    { name: "replyToEmail", type: "email" },
    { name: "paid", type: "boolean" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "newsletters_company_slug_unique", fields: ["companyId","slug"], unique: true },
  ],
};
