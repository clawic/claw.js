import type { BuiltinCollectionDefinition } from "../_types.ts";

export const CHILD_MILESTONES: BuiltinCollectionDefinition = {
  name: "child_milestones",
  displayName: "Child Milestones",
  family: "family_care",
  aliases: ["child_milestone","child_milestones"],
  fields: [
    { name: "childId", type: "relation", required: true, relation: { collectionName: "children_profiles" } },
    { name: "achievedAt", type: "date", required: true },
    { name: "title", type: "text", required: true },
    { name: "description", type: "text" },
    { name: "image", type: "file" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "child_milestones_child_idx", fields: ["childId"] },
  ],
};
