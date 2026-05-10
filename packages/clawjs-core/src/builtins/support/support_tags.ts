import type { BuiltinCollectionDefinition } from "../_types.ts";

export const SUPPORT_TAGS: BuiltinCollectionDefinition = {
  name: "support_tags",
  displayName: "Support Tags",
  family: "support",
  aliases: ["support_tag","support_tags"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "name", type: "text", required: true },
    { name: "color", type: "text" },
    { name: "description", type: "text" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "supp_tags_company_name_unique", fields: ["companyId","name"], unique: true },
  ],
};
