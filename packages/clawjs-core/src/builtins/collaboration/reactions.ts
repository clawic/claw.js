import type { BuiltinCollectionDefinition } from "../_types.ts";

export const REACTIONS: BuiltinCollectionDefinition = {
  name: "reactions",
  displayName: "Reactions",
  family: "collaboration",
  aliases: ["reaction","reactions"],
  fields: [
    { name: "parentKind", type: "select", required: true, options: ["comment","issue","task","project_update","initiative_update","document"] },
    { name: "parentId", type: "text", required: true },
    { name: "emoji", type: "text", required: true },
    { name: "actorId", type: "relation", required: true, relation: { collectionName: "actors" } },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "reactions_unique", fields: ["parentKind","parentId","emoji","actorId"], unique: true },
    { name: "reactions_parent_idx", fields: ["parentKind","parentId"] },
  ],
};
