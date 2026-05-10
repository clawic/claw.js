import type { BuiltinCollectionDefinition } from "../_types.ts";

export const MAGIC_AUTH_TOKENS: BuiltinCollectionDefinition = {
  name: "magic_auth_tokens",
  displayName: "Magic Auth Tokens",
  family: "identity",
  aliases: ["magic_link","magic_auth_token","magic_auth_tokens"],
  fields: [
    { name: "companyId", type: "relation", relation: { collectionName: "companies" } },
    { name: "email", type: "email", required: true },
    { name: "token", type: "text", required: true },
    { name: "expiresAt", type: "date", required: true },
    { name: "usedAt", type: "date" },
    { name: "ip", type: "text" },
    { name: "userAgent", type: "text" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "magic_tokens_token_unique", fields: ["token"], unique: true },
    { name: "magic_tokens_email_idx", fields: ["email"] },
  ],
};
