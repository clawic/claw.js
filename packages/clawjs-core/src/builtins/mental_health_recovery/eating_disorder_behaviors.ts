import type { BuiltinCollectionDefinition } from "../_types.ts";

export const EATING_DISORDER_BEHAVIORS: BuiltinCollectionDefinition = {
  name: "eating_disorder_behaviors",
  displayName: "Eating Disorder Behaviors",
  family: "mental_health_recovery",
  aliases: ["eating_disorder_behavior","eating_disorder_behaviors"],
  fields: [
    { name: "kind", type: "select", options: ["binge","purge","restrict","exercise_compensatory","body_check","other"] },
    { name: "occurredAt", type: "date", required: true },
    { name: "context", type: "text" },
    { name: "severity", type: "rating", enumScale: 10 },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "eating_disorder_behaviors_kind_idx", fields: ["kind"] },
  ],
};
