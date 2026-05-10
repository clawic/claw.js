import type { BuiltinCollectionDefinition } from "../_types.ts";

export const OUTFIT_LOGS: BuiltinCollectionDefinition = {
  name: "outfit_logs",
  displayName: "Outfit Logs",
  family: "wardrobe",
  aliases: ["outfit_log","outfit_logs"],
  fields: [
    { name: "outfitId", type: "relation", required: true, relation: { collectionName: "outfits" } },
    { name: "wornAt", type: "date", required: true },
    { name: "event", type: "text" },
    { name: "temperature", type: "number" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "outfit_logs_worn_idx", fields: ["wornAt"] },
  ],
};
