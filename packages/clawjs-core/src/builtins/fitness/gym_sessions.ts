import type { BuiltinCollectionDefinition } from "../_types.ts";

export const GYM_SESSIONS: BuiltinCollectionDefinition = {
  name: "gym_sessions",
  displayName: "Gym Sessions",
  family: "fitness",
  aliases: ["gym_session","gym_sessions"],
  fields: [
    { name: "startedAt", type: "date", required: true },
    { name: "endedAt", type: "date" },
    { name: "gym", type: "text" },
    { name: "durationMinutes", type: "number" },
    { name: "workoutIds", type: "json" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "gym_sessions_started_idx", fields: ["startedAt"] },
  ],
};
