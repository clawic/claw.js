import type { BuiltinCollectionDefinition } from "../_types.ts";

export const AVAILABILITY_WINDOWS: BuiltinCollectionDefinition = {
  name: "availability_windows",
  displayName: "Availability Windows",
  family: "calendar",
  aliases: ["availability","availability_window","availability_windows"],
  fields: [
    { name: "actorId", type: "relation", required: true, relation: { collectionName: "actors" } },
    { name: "dayOfWeek", type: "number" },
    { name: "startTime", type: "text" },
    { name: "endTime", type: "text" },
    { name: "timezone", type: "text" },
    { name: "effectiveFrom", type: "date" },
    { name: "effectiveUntil", type: "date" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "avail_actor_idx", fields: ["actorId"] },
  ],
};
