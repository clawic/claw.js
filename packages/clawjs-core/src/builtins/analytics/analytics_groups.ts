import type { BuiltinCollectionDefinition } from "../_types.ts";

export const ANALYTICS_GROUPS: BuiltinCollectionDefinition = {
  name: "analytics_groups",
  displayName: "Analytics Groups",
  family: "analytics",
  aliases: ["analytics_group","analytics_groups"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "groupType", type: "select", required: true, options: ["organization","team","account","workspace","tenant","other"] },
    { name: "groupKey", type: "text", required: true },
    { name: "properties", type: "json" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "anal_groups_unique", fields: ["companyId","groupType","groupKey"], unique: true },
  ],
};
