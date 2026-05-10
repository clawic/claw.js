import type { BuiltinCollectionDefinition } from "../_types.ts";

export const ROLE_ASSIGNMENTS: BuiltinCollectionDefinition = {
  name: "role_assignments",
  displayName: "Role Assignments",
  family: "identity",
  aliases: ["role_assignment","role_assignments"],
  fields: [
    { name: "roleId", type: "relation", relation: { collectionName: "roles" } },
    { name: "projectRoleId", type: "relation", relation: { collectionName: "project_roles" } },
    { name: "actorId", type: "relation", required: true, relation: { collectionName: "actors" } },
    { name: "scopeKind", type: "select", required: true, options: ["workspace","company","team","project","portfolio","portfolio_item"] },
    { name: "scopeId", type: "text" },
    { name: "grantedByActorId", type: "relation", relation: { collectionName: "actors" } },
    { name: "expiresAt", type: "date" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "role_assign_actor_idx", fields: ["actorId"] },
    { name: "role_assign_scope_idx", fields: ["scopeKind","scopeId"] },
  ],
};
