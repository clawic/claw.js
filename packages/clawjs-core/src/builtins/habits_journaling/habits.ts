import type { BuiltinCollectionDefinition } from "../_types.ts";

export const HABITS: BuiltinCollectionDefinition = {
  name: "habits",
  displayName: "Habits",
  family: "habits_journaling",
  aliases: ["habit","habits"],
  fields: [
    { name: "title", type: "text", required: true },
    { name: "description", type: "text" },
    { name: "cadence", type: "select", options: ["daily","weekdays","weekends","weekly","monthly","custom"] },
    { name: "color", type: "text" },
    { name: "icon", type: "text" },
    { name: "targetPerPeriod", type: "number" },
    { name: "active", type: "boolean" },
    { name: "startedAt", type: "date" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "habits_active_idx", fields: ["active"] },
  ],
};
