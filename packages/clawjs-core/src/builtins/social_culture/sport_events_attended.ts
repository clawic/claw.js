import type { BuiltinCollectionDefinition } from "../_types.ts";

export const SPORT_EVENTS_ATTENDED: BuiltinCollectionDefinition = {
  name: "sport_events_attended",
  displayName: "Sport Events Attended",
  family: "social_culture",
  aliases: ["sport_event_attendance","sport_events_attended"],
  fields: [
    { name: "event", type: "text", required: true },
    { name: "sport", type: "text" },
    { name: "venue", type: "text" },
    { name: "attendedAt", type: "date", required: true },
    { name: "ticketPrice", type: "money" },
    { name: "partner", type: "text" },
    { name: "rating", type: "rating", enumScale: 5 },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "sport_events_attended_attended_idx", fields: ["attendedAt"] },
  ],
};
