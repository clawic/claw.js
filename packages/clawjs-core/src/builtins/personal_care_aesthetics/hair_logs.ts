import type { BuiltinCollectionDefinition } from "../_types.ts";

export const HAIR_LOGS: BuiltinCollectionDefinition = {
  name: "hair_logs",
  displayName: "Hair Logs",
  family: "personal_care_aesthetics",
  aliases: ["hair_log","hair_logs"],
  fields: [
    { name: "loggedAt", type: "date", required: true },
    { name: "lengthCm", type: "number" },
    { name: "color", type: "text" },
    { name: "treatment", type: "text" },
    { name: "conditionerUsed", type: "text" },
    { name: "image", type: "file" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "hair_logs_logged_idx", fields: ["loggedAt"] },
  ],
};
