import type { BuiltinCollectionDefinition } from "../_types.ts";

export const SKILL_PROGRESS_LOGS: BuiltinCollectionDefinition = {
  name: "skill_progress_logs",
  displayName: "Skill Progress Logs",
  family: "learning",
  aliases: ["skill_progress_log","skill_progress_logs"],
  fields: [
    { name: "skillId", type: "relation", required: true, relation: { collectionName: "skills" } },
    { name: "loggedAt", type: "date", required: true },
    { name: "level", type: "select", options: ["novice","beginner","intermediate","advanced","expert"] },
    { name: "durationMinutes", type: "number" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "skill_progress_logs_skill_idx", fields: ["skillId"] },
  ],
};
