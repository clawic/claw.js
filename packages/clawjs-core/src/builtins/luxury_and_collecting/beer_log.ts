import type { BuiltinCollectionDefinition } from "../_types.ts";

export const BEER_LOG: BuiltinCollectionDefinition = {
  name: "beer_log",
  displayName: "Beer Log",
  family: "luxury_and_collecting",
  aliases: ["beer_log_entry","beer_log"],
  fields: [
    { name: "brewery", type: "text", required: true },
    { name: "name", type: "text", required: true },
    { name: "style", type: "text" },
    { name: "abv", type: "percent" },
    { name: "ibu", type: "number" },
    { name: "rating", type: "rating", enumScale: 5 },
    { name: "brewedAt", type: "date" },
    { name: "drunkAt", type: "date" },
    { name: "image", type: "file" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "beer_log_brewery_idx", fields: ["brewery"] },
    { name: "beer_log_drunk_idx", fields: ["drunkAt"] },
  ],
};
