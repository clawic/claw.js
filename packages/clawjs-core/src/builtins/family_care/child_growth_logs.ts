import type { BuiltinCollectionDefinition } from "../_types.ts";

export const CHILD_GROWTH_LOGS: BuiltinCollectionDefinition = {
  name: "child_growth_logs",
  displayName: "Child Growth Logs",
  family: "family_care",
  aliases: ["child_growth_log","child_growth_logs"],
  fields: [
    { name: "childId", type: "relation", required: true, relation: { collectionName: "children_profiles" } },
    { name: "loggedAt", type: "date", required: true },
    { name: "weightKg", type: "number" },
    { name: "heightCm", type: "number" },
    { name: "headCm", type: "number" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "child_growth_logs_child_idx", fields: ["childId"] },
  ],
};
