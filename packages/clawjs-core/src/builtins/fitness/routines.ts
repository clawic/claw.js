import type { BuiltinCollectionDefinition } from "../_types.ts";

export const ROUTINES: BuiltinCollectionDefinition = {
  name: "routines",
  displayName: "Workout Routines",
  family: "fitness",
  aliases: ["routine","routines"],
  fields: [
    { name: "title", type: "text", required: true },
    { name: "description", type: "text" },
    { name: "schedule", type: "select", options: ["daily","weekly","custom"] },
    { name: "dayPattern", type: "json" },
    { name: "active", type: "boolean" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "routines_active_idx", fields: ["active"] },
  ],
};
