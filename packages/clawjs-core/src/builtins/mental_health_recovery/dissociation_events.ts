import type { BuiltinCollectionDefinition } from "../_types.ts";

export const DISSOCIATION_EVENTS: BuiltinCollectionDefinition = {
  name: "dissociation_events",
  displayName: "Dissociation Events",
  family: "mental_health_recovery",
  aliases: ["dissociation_event","dissociation_events"],
  fields: [
    { name: "startedAt", type: "date", required: true },
    { name: "durationMinutes", type: "duration", durationDisplayUnit: "minute" },
    { name: "trigger", type: "text" },
    { name: "depersonalization", type: "boolean" },
    { name: "derealization", type: "boolean" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "dissociation_events_started_idx", fields: ["startedAt"] },
  ],
};
