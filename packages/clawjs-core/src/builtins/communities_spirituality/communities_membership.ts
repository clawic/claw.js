import type { BuiltinCollectionDefinition } from "../_types.ts";

export const COMMUNITIES_MEMBERSHIP: BuiltinCollectionDefinition = {
  name: "communities_membership",
  displayName: "Community Memberships",
  family: "communities_spirituality",
  aliases: ["community_membership","communities_membership","community"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "kind", type: "select", options: ["club","association","nonprofit","religious_group","neighborhood","online","other"] },
    { name: "joinedAt", type: "date" },
    { name: "leftAt", type: "date" },
    { name: "role", type: "text" },
    { name: "active", type: "boolean" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "communities_membership_active_idx", fields: ["active"] },
  ],
};
