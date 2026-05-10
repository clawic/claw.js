import type { BuiltinCollectionDefinition } from "../_types.ts";

export const MEDITATIONS: BuiltinCollectionDefinition = {
  name: "meditations",
  displayName: "Meditations",
  family: "communities_spirituality",
  aliases: ["meditation","meditations"],
  fields: [
    { name: "title", type: "text", required: true },
    { name: "loggedAt", type: "date", required: true },
    { name: "durationMinutes", type: "number" },
    { name: "technique", type: "select", options: ["mindfulness","breath","loving_kindness","body_scan","transcendental","guided","other"] },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "meditations_logged_idx", fields: ["loggedAt"] },
  ],
};
