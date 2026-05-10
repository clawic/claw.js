import type { BuiltinCollectionDefinition } from "../_types.ts";

export const WORKOUTS: BuiltinCollectionDefinition = {
  name: "workouts",
  displayName: "Workouts",
  family: "fitness",
  aliases: ["workout","workouts"],
  fields: [
    { name: "title", type: "text", required: true },
    { name: "performedAt", type: "date", required: true },
    { name: "type", type: "select", options: ["strength","cardio","yoga","stretch","sport","mixed","other"] },
    { name: "durationMinutes", type: "number" },
    { name: "caloriesBurned", type: "number" },
    { name: "rpe", type: "number" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "workouts_performed_idx", fields: ["performedAt"] },
    { name: "workouts_type_idx", fields: ["type"] },
  ],
};
