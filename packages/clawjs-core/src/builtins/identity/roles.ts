import type { BuiltinCollectionDefinition } from "../_types.ts";

export const ROLES: BuiltinCollectionDefinition = {
  name: "roles",
  displayName: "Roles",
  family: "identity",
  aliases: ["role","roles"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "key", type: "text", required: true },
    { name: "displayName", type: "text", required: true },
    { name: "description", type: "text" },
    { name: "permissions", type: "json" },
    { name: "isBuiltin", type: "boolean" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "roles_company_key_unique", fields: ["companyId","key"], unique: true },
  ],
};
