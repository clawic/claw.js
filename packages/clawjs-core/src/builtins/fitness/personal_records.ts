import type { BuiltinCollectionDefinition } from "../_types.ts";

export const PERSONAL_RECORDS: BuiltinCollectionDefinition = {
  name: "personal_records",
  displayName: "Personal Records",
  family: "fitness",
  aliases: ["personal_record","personal_records","pr"],
  fields: [
    { name: "exerciseId", type: "relation", relation: { collectionName: "exercises" } },
    { name: "exerciseName", type: "text" },
    { name: "metric", type: "select", options: ["weight","reps","distance","duration"] },
    { name: "value", type: "number", required: true },
    { name: "unit", type: "text" },
    { name: "achievedAt", type: "date", required: true },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "personal_records_exercise_idx", fields: ["exerciseId"] },
    { name: "personal_records_achieved_idx", fields: ["achievedAt"] },
  ],
};
