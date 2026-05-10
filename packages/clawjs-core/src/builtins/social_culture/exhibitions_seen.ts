import type { BuiltinCollectionDefinition } from "../_types.ts";

export const EXHIBITIONS_SEEN: BuiltinCollectionDefinition = {
  name: "exhibitions_seen",
  displayName: "Exhibitions Seen",
  family: "social_culture",
  aliases: ["exhibition","exhibitions_seen"],
  fields: [
    { name: "title", type: "text", required: true },
    { name: "museumId", type: "relation", relation: { collectionName: "museums_visited" } },
    { name: "startedAt", type: "date" },
    { name: "endedAt", type: "date" },
    { name: "seenAt", type: "date", required: true },
    { name: "artist", type: "text" },
    { name: "rating", type: "rating", enumScale: 5 },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "exhibitions_seen_seen_idx", fields: ["seenAt"] },
  ],
};
