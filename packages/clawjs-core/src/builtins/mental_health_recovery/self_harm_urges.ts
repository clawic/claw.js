import type { BuiltinCollectionDefinition } from "../_types.ts";

export const SELF_HARM_URGES: BuiltinCollectionDefinition = {
  name: "self_harm_urges",
  displayName: "Self-Harm Urges",
  family: "mental_health_recovery",
  aliases: ["self_harm_urge","self_harm_urges"],
  fields: [
    { name: "occurredAt", type: "date", required: true },
    { name: "intensity", type: "rating", enumScale: 10 },
    { name: "copingUsed", type: "text" },
    { name: "actedOn", type: "boolean" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "self_harm_urges_occurred_idx", fields: ["occurredAt"] },
  ],
};
