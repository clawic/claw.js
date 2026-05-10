import type { BuiltinCollectionDefinition } from "../_types.ts";

export const CONCERTS_ATTENDED: BuiltinCollectionDefinition = {
  name: "concerts_attended",
  displayName: "Concerts Attended",
  family: "social_culture",
  aliases: ["concert","concerts_attended"],
  fields: [
    { name: "artist", type: "text", required: true },
    { name: "venue", type: "text" },
    { name: "city", type: "text" },
    { name: "concertDate", type: "date", required: true },
    { name: "ticketPrice", type: "money" },
    { name: "openingActs", type: "json" },
    { name: "setlistUrl", type: "url" },
    { name: "rating", type: "rating", enumScale: 5 },
    { name: "image", type: "file" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "concerts_attended_date_idx", fields: ["concertDate"] },
  ],
};
