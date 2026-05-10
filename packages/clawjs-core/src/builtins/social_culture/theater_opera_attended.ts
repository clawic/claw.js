import type { BuiltinCollectionDefinition } from "../_types.ts";

export const THEATER_OPERA_ATTENDED: BuiltinCollectionDefinition = {
  name: "theater_opera_attended",
  displayName: "Theater & Opera Attended",
  family: "social_culture",
  aliases: ["theater_attendance","theater_opera_attended"],
  fields: [
    { name: "productionTitle", type: "text", required: true },
    { name: "venue", type: "text" },
    { name: "performedAt", type: "date", required: true },
    { name: "director", type: "text" },
    { name: "cast", type: "json" },
    { name: "ticketPrice", type: "money" },
    { name: "rating", type: "rating", enumScale: 5 },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "theater_opera_attended_performed_idx", fields: ["performedAt"] },
  ],
};
