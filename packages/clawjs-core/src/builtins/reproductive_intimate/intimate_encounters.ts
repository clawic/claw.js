import type { BuiltinCollectionDefinition } from "../_types.ts";

export const INTIMATE_ENCOUNTERS: BuiltinCollectionDefinition = {
  name: "intimate_encounters",
  displayName: "Intimate Encounters",
  family: "reproductive_intimate",
  aliases: ["intimate_encounter","intimate_encounters"],
  fields: [
    { name: "occurredAt", type: "date", required: true },
    { name: "partnerId", type: "relation", relation: { collectionName: "personal_contacts" } },
    { name: "protectionUsed", type: "boolean" },
    { name: "satisfaction", type: "rating", enumScale: 5 },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "intimate_encounters_occurred_idx", fields: ["occurredAt"] },
  ],
};
