import type { BuiltinCollectionDefinition } from "../_types.ts";

export const HUNTING_LOG: BuiltinCollectionDefinition = {
  name: "hunting_log",
  displayName: "Hunting Log",
  family: "luxury_and_collecting",
  aliases: ["hunting_log_entry","hunting_log"],
  fields: [
    { name: "species", type: "text" },
    { name: "location", type: "text" },
    { name: "locationGeo", type: "geo_point" },
    { name: "season", type: "text" },
    { name: "weather", type: "text" },
    { name: "weapon", type: "text" },
    { name: "outcome", type: "text" },
    { name: "partner", type: "text" },
    { name: "huntedAt", type: "date", required: true },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "hunting_log_hunted_idx", fields: ["huntedAt"] },
  ],
};
