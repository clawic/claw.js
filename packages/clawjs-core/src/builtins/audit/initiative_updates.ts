import type { BuiltinCollectionDefinition } from "../_types.ts";

export const INITIATIVE_UPDATES: BuiltinCollectionDefinition = {
  name: "initiative_updates",
  displayName: "Initiative Updates",
  family: "audit",
  aliases: ["initiative_update","initiative_updates"],
  fields: [
    { name: "initiativeId", type: "relation", required: true, relation: { collectionName: "epics" } },
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
    { name: "init_updates_initiative_idx", fields: ["initiativeId"] },
    { name: "init_updates_health_idx", fields: ["health"] },
  ],
};
