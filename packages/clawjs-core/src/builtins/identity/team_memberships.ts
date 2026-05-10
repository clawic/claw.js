import type { BuiltinCollectionDefinition } from "../_types.ts";

export const TEAM_MEMBERSHIPS: BuiltinCollectionDefinition = {
  name: "team_memberships",
  displayName: "Team Memberships",
  family: "identity",
  aliases: ["team_member","team_membership","team_memberships"],
  fields: [
    { name: "teamId", type: "relation", required: true, relation: { collectionName: "teams" } },
    { name: "actorId", type: "relation", required: true, relation: { collectionName: "actors" } },
    { name: "role", type: "select", required: true, options: ["MEMBER","OWNER","ADMIN"] },
    { name: "joinedAt", type: "date" },
    { name: "sortOrder", type: "number" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "team_mem_team_actor_unique", fields: ["teamId","actorId"], unique: true },
    { name: "team_mem_actor_idx", fields: ["actorId"] },
  ],
};
