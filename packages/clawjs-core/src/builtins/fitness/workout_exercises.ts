import type { BuiltinCollectionDefinition } from "../_types.ts";

export const WORKOUT_EXERCISES: BuiltinCollectionDefinition = {
  name: "workout_exercises",
  displayName: "Workout Exercises",
  family: "fitness",
  aliases: ["workout_exercise","workout_exercises"],
  fields: [
    { name: "workoutId", type: "relation", required: true, relation: { collectionName: "workouts" } },
    { name: "exerciseId", type: "relation", relation: { collectionName: "exercises" } },
    { name: "name", type: "text" },
    { name: "position", type: "number", aliases: ["exerciseOrder"] },
    { name: "sets", type: "number" },
    { name: "reps", type: "number" },
    { name: "weightKg", type: "number" },
    { name: "durationSeconds", type: "number" },
    { name: "distanceMeters", type: "number" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "workout_exercises_workout_idx", fields: ["workoutId"] },
  ],
};
