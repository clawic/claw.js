import type { BuiltinCollectionDefinition } from "../_types.ts";

export const BREWING_BATCHES: BuiltinCollectionDefinition = {
  name: "brewing_batches",
  displayName: "Brewing Batches",
  family: "cooking",
  aliases: ["brewing_batch","brewing_batches"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "kind", type: "select", options: ["beer","kombucha","kimchi","sourdough","cider","mead","sauerkraut","other"] },
    { name: "startedAt", type: "date", required: true },
    { name: "readyAt", type: "date" },
    { name: "ingredients", type: "json" },
    { name: "processNotes", type: "markdown" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "brewing_batches_kind_idx", fields: ["kind"] },
  ],
};
