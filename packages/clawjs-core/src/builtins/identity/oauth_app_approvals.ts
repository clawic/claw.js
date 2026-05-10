import type { BuiltinCollectionDefinition } from "../_types.ts";

export const OAUTH_APP_APPROVALS: BuiltinCollectionDefinition = {
  name: "oauth_app_approvals",
  displayName: "OAuth App Approvals",
  family: "identity",
  aliases: ["oauth_app_approval","oauth_app_approvals"],
  fields: [
    { name: "oauthAppId", type: "relation", required: true, relation: { collectionName: "oauth_apps" } },
    { name: "actorId", type: "relation", required: true, relation: { collectionName: "actors" } },
    { name: "status", type: "select", required: true, options: ["approved","pending","revoked"] },
    { name: "approvedAt", type: "date" },
    { name: "revokedAt", type: "date" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "oauth_approvals_app_idx", fields: ["oauthAppId"] },
    { name: "oauth_approvals_actor_idx", fields: ["actorId"] },
  ],
};
