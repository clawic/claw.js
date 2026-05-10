import type { BuiltinCollectionDefinition } from "../_types.ts";

export const ROUTINE_WORKOUTS: BuiltinCollectionDefinition = {
  name: "routine_workouts",
  displayName: "Routine Workouts",
  family: "fitness",
  aliases: ["routine_workout","routine_workouts"],
  fields: [
    { name: "routineId", type: "relation", required: true, relation: { collectionName: "routines" } },
    { name: "dayOfWeek", type: "text" },
    { name: "position", type: "number" },
    { name: "name", type: "text" },
    { name: "exercises", type: "json" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "routine_workouts_routine_idx", fields: ["routineId"] },
  ],
};
