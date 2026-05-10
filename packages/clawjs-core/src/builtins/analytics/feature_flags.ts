import type { BuiltinCollectionDefinition } from "../_types.ts";

export const FEATURE_FLAGS: BuiltinCollectionDefinition = {
  name: "feature_flags",
  displayName: "Feature Flags",
  family: "analytics",
  aliases: ["flag","flags","feature_flag","feature_flags"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "key", type: "text", required: true },
    { name: "name", type: "text" },
    { name: "description", type: "text" },
    { name: "defaultVariation", type: "text" },
    { name: "variations", type: "json" },
    { name: "targeting", type: "json" },
    { name: "rolloutPercent", type: "number" },
    { name: "enabled", type: "boolean" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "flags_company_key_unique", fields: ["companyId","key"], unique: true },
  ],
};
