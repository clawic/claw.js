import type { BuiltinCollectionDefinition } from "../_types.ts";

export const RACES_REGISTERED: BuiltinCollectionDefinition = {
  name: "races_registered",
  displayName: "Races Registered",
  family: "fitness",
  aliases: ["race_registered","races_registered"],
  fields: [
    { name: "eventName", type: "text", required: true },
    { name: "eventDate", type: "date", required: true },
    { name: "distanceKm", type: "number" },
    { name: "registeredAt", type: "date" },
    { name: "fee", type: "money" },
    { name: "status", type: "select", options: ["registered","confirmed","completed","dnf","dns","cancelled"] },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "races_registered_event_idx", fields: ["eventDate"] },
  ],
};
