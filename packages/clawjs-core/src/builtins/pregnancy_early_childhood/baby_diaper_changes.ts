import type { BuiltinCollectionDefinition } from "../_types.ts";

export const BABY_DIAPER_CHANGES: BuiltinCollectionDefinition = {
  name: "baby_diaper_changes",
  displayName: "Baby Diaper Changes",
  family: "pregnancy_early_childhood",
  aliases: ["baby_diaper_change","baby_diaper_changes"],
  fields: [
    { name: "childId", type: "relation", required: true, relation: { collectionName: "children_profiles" } },
    { name: "changedAt", type: "date", required: true },
    { name: "kind", type: "select", options: ["wet","dirty","both","dry"] },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "baby_diaper_changes_child_idx", fields: ["childId"] },
  ],
};
