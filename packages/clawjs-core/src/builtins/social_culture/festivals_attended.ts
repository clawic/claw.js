import type { BuiltinCollectionDefinition } from "../_types.ts";

export const FESTIVALS_ATTENDED: BuiltinCollectionDefinition = {
  name: "festivals_attended",
  displayName: "Festivals Attended",
  family: "social_culture",
  aliases: ["festival","festivals_attended"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "location", type: "text" },
    { name: "startedAt", type: "date" },
    { name: "endedAt", type: "date" },
    { name: "kind", type: "select", options: ["music","cultural","food","film","art","tech","religious","other"] },
    { name: "ticketPrice", type: "money" },
    { name: "lineup", type: "json" },
    { name: "rating", type: "rating", enumScale: 5 },
    { name: "images", type: "json" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "festivals_attended_started_idx", fields: ["startedAt"] },
  ],
  rules: [
    {"kind":"compare_dates","left":"startedAt","op":"<=","right":"endedAt"},
  ],
};
