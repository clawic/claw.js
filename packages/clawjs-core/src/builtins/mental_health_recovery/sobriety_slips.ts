import type { BuiltinCollectionDefinition } from "../_types.ts";

export const SOBRIETY_SLIPS: BuiltinCollectionDefinition = {
  name: "sobriety_slips",
  displayName: "Sobriety Slips",
  family: "mental_health_recovery",
  aliases: ["sobriety_slip","sobriety_slips"],
  fields: [
    { name: "trackerId", type: "relation", required: true, relation: { collectionName: "sobriety_trackers" } },
    { name: "occurredAt", type: "date", required: true },
    { name: "amount", type: "text" },
    { name: "trigger", type: "text" },
    { name: "recoveredAt", type: "date" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "sobriety_slips_tracker_idx", fields: ["trackerId"] },
  ],
};
