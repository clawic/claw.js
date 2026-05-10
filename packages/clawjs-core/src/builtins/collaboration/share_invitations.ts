import type { BuiltinCollectionDefinition } from "../_types.ts";

export const SHARE_INVITATIONS: BuiltinCollectionDefinition = {
  name: "share_invitations",
  displayName: "Share Invitations",
  family: "collaboration",
  aliases: ["share","shares","share_invitation","share_invitations"],
  fields: [
    { name: "entityKind", type: "select", required: true, options: ["document","wiki_page","issue","project","dashboard","saved_view"] },
    { name: "entityId", type: "text", required: true },
    { name: "slug", type: "text", required: true },
    { name: "email", type: "email" },
    { name: "role", type: "select", options: ["view","comment","edit"] },
    { name: "expiresAt", type: "date" },
    { name: "passwordHash", type: "text" },
    { name: "accessCount", type: "number" },
    { name: "revokedAt", type: "date" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "share_inv_slug_unique", fields: ["slug"], unique: true },
    { name: "share_inv_entity_idx", fields: ["entityKind","entityId"] },
  ],
};
