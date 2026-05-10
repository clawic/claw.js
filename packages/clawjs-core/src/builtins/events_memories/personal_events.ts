import type { BuiltinCollectionDefinition } from "../_types.ts";

export const PERSONAL_EVENTS: BuiltinCollectionDefinition = {
  name: "personal_events",
  displayName: "Personal Events",
  family: "events_memories",
  aliases: ["personal_event","personal_events"],
  fields: [
    { name: "title", type: "text", required: true },
    { name: "startsAt", type: "date", required: true },
    { name: "endsAt", type: "date" },
    { name: "location", type: "text" },
    { name: "description", type: "text" },
    { name: "tags", type: "json" },
    { name: "images", type: "json" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "personal_events_start_idx", fields: ["startsAt"] },
  ],
};
