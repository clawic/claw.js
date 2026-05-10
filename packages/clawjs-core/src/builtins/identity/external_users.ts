import type { BuiltinCollectionDefinition } from "../_types.ts";

export const EXTERNAL_USERS: BuiltinCollectionDefinition = {
  name: "external_users",
  displayName: "External Users",
  family: "identity",
  aliases: ["external_user","external_users"],
  fields: [
    { name: "companyId", type: "relation", relation: { collectionName: "companies" } },
    { name: "email", type: "email" },
    { name: "name", type: "text" },
    { name: "displayName", type: "text" },
    { name: "avatarUrl", type: "text" },
    { name: "externalSource", type: "select", required: true, options: ["slack","intercom","zendesk","front","email","discord","telegram","other"] },
    { name: "externalUserId", type: "text" },
    { name: "externalOrganizationId", type: "text" },
    { name: "customerId", type: "relation", relation: { collectionName: "customers" } },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "external_users_company_idx", fields: ["companyId"] },
    { name: "external_users_source_idx", fields: ["externalSource"] },
    { name: "external_users_email_idx", fields: ["email"] },
  ],
};
