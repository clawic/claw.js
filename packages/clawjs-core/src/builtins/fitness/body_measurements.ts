import type { BuiltinCollectionDefinition } from "../_types.ts";

export const BODY_MEASUREMENTS: BuiltinCollectionDefinition = {
  name: "body_measurements",
  displayName: "Body Measurements",
  family: "fitness",
  aliases: ["body_measurement","body_measurements"],
  fields: [
    { name: "loggedAt", type: "date", required: true },
    { name: "chestCm", type: "number" },
    { name: "waistCm", type: "number" },
    { name: "hipsCm", type: "number" },
    { name: "armCm", type: "number" },
    { name: "thighCm", type: "number" },
    { name: "calfCm", type: "number" },
    { name: "neckCm", type: "number" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "body_measurements_logged_idx", fields: ["loggedAt"] },
  ],
};
