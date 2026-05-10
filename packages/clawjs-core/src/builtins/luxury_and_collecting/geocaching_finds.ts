import type { BuiltinCollectionDefinition } from "../_types.ts";

export const GEOCACHING_FINDS: BuiltinCollectionDefinition = {
  name: "geocaching_finds",
  displayName: "Geocaching Finds",
  family: "luxury_and_collecting",
  aliases: ["geocache","geocaching_finds"],
  fields: [
    { name: "geocacheCode", type: "text", required: true },
    { name: "difficulty", type: "rating", enumScale: 5 },
    { name: "terrain", type: "rating", enumScale: 5 },
    { name: "locationGeo", type: "geo_point" },
    { name: "foundAt", type: "date", required: true },
    { name: "containerSize", type: "text" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "geocaching_finds_code_idx", fields: ["geocacheCode"] },
    { name: "geocaching_finds_found_idx", fields: ["foundAt"] },
  ],
};
