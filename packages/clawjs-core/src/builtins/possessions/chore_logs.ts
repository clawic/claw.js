import type { BuiltinCollectionDefinition } from "../_types.ts";

export const CHORE_LOGS: BuiltinCollectionDefinition = {
  name: "chore_logs",
  displayName: "Chore Logs",
  family: "possessions",
  aliases: ["chore_log","chore_logs"],
  fields: [
    { name: "choreId", type: "relation", required: true, relation: { collectionName: "chores" } },
    { name: "completedAt", type: "date", required: true },
    { name: "completedBy", type: "relation", relation: { collectionName: "household_members" } },
    { name: "durationMinutes", type: "number" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "chore_logs_chore_idx", fields: ["choreId"] },
  ],
};
