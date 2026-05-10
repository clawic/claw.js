import type { BuiltinCollectionDefinition } from "../_types.ts";

export const API_KEYS: BuiltinCollectionDefinition = {
  name: "api_keys",
  displayName: "API Keys",
  family: "identity",
  aliases: ["apikey","apikeys","api_key","api_keys"],
  fields: [
    { name: "actorId", type: "relation", required: true, relation: { collectionName: "actors" } },
    { name: "label", type: "text", required: true },
    { name: "keyHash", type: "text", required: true },
    { name: "scopes", type: "json" },
    { name: "lastUsedAt", type: "date" },
    { name: "revokedAt", type: "date" },
    { name: "expiresAt", type: "date" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "api_keys_actor_idx", fields: ["actorId"] },
    { name: "api_keys_hash_unique", fields: ["keyHash"], unique: true },
  ],
};
