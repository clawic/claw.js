import type { BuiltinCollectionDefinition } from "../_types.ts";

export const ORGANIZATION_INVITES: BuiltinCollectionDefinition = {
  name: "organization_invites",
  displayName: "Organization Invites",
  family: "identity",
  aliases: ["invite","invites","organization_invite","organization_invites"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "email", type: "email", required: true },
    { name: "role", type: "text" },
    { name: "invitedByActorId", type: "relation", relation: { collectionName: "actors" } },
    { name: "token", type: "text", required: true },
    { name: "expiresAt", type: "date", required: true },
    { name: "acceptedAt", type: "date" },
    { name: "revokedAt", type: "date" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "invites_company_idx", fields: ["companyId"] },
    { name: "invites_token_unique", fields: ["token"], unique: true },
    { name: "invites_email_idx", fields: ["email"] },
  ],
};
