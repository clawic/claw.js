import type { BuiltinCollectionDefinition } from "../_types.ts";

export const SUPPORT_MACROS: BuiltinCollectionDefinition = {
  name: "support_macros",
  displayName: "Support Macros",
  family: "support",
  aliases: ["macro","macros","support_macro","support_macros"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "teamId", type: "relation", relation: { collectionName: "teams" } },
    { name: "name", type: "text", required: true },
    { name: "body", type: "text" },
    { name: "actions", type: "json" },
    { name: "categoryGroup", type: "text" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "macros_company_idx", fields: ["companyId"] },
  ],
};
