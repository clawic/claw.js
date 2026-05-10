import type { BuiltinCollectionDefinition } from "../_types.ts";

export const PROJECT_UPDATES: BuiltinCollectionDefinition = {
  name: "project_updates",
  displayName: "Project Updates",
  family: "audit",
  aliases: ["project_update","project_updates"],
  fields: [
    { name: "projectId", type: "relation", required: true, relation: { collectionName: "projects" } },
    { name: "body", type: "text" },
    { name: "bodyData", type: "json" },
    { name: "health", type: "select", required: true, options: ["on_track","at_risk","off_track"] },
    { name: "actorId", type: "relation", relation: { collectionName: "actors" } },
    { name: "editedAt", type: "date" },
    { name: "diffMarkdown", type: "text" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "proj_updates_project_idx", fields: ["projectId"] },
    { name: "proj_updates_health_idx", fields: ["health"] },
  ],
};
