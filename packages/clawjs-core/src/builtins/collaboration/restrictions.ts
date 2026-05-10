import type { BuiltinCollectionDefinition } from "../_types.ts";

export const RESTRICTIONS: BuiltinCollectionDefinition = {
  name: "restrictions",
  displayName: "Restrictions",
  family: "collaboration",
  aliases: ["restriction","restrictions"],
  fields: [
    { name: "entityKind", type: "select", required: true, options: ["document","wiki_page","issue","project","comment","worklog"] },
    { name: "entityId", type: "text", required: true },
    { name: "actorId", type: "relation", relation: { collectionName: "actors" } },
    { name: "roleId", type: "relation", relation: { collectionName: "roles" } },
    { name: "projectRoleId", type: "relation", relation: { collectionName: "project_roles" } },
    { name: "permission", type: "select", required: true, options: ["view","comment","edit","admin"] },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "restrictions_entity_idx", fields: ["entityKind","entityId"] },
    { name: "restrictions_actor_idx", fields: ["actorId"] },
  ],
};
