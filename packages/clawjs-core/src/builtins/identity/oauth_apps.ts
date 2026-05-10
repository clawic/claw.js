import type { BuiltinCollectionDefinition } from "../_types.ts";

export const OAUTH_APPS: BuiltinCollectionDefinition = {
  name: "oauth_apps",
  displayName: "OAuth Apps",
  family: "identity",
  aliases: ["oauth_app","oauth_apps","app","apps"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "clientId", type: "text", required: true },
    { name: "clientSecretHash", type: "text", required: true },
    { name: "name", type: "text", required: true },
    { name: "description", type: "text" },
    { name: "redirectUrls", type: "json" },
    { name: "developer", type: "text" },
    { name: "developerUrl", type: "text" },
    { name: "scopes", type: "json" },
    { name: "publicId", type: "text" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "oauth_apps_company_idx", fields: ["companyId"] },
    { name: "oauth_apps_client_unique", fields: ["clientId"], unique: true },
  ],
};
