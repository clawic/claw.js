import type { BuiltinCollectionDefinition } from "../_types.ts";

export const MEDICATION_DOSES: BuiltinCollectionDefinition = {
  name: "medication_doses",
  displayName: "Medication Doses",
  family: "health",
  aliases: ["medication_dose","medication_doses"],
  fields: [
    { name: "medicationId", type: "relation", required: true, relation: { collectionName: "medications" } },
    { name: "takenAt", type: "date", required: true },
    { name: "amount", type: "text", aliases: ["doseAmount"] },
    { name: "unit", type: "text", aliases: ["doseUnit"] },
    { name: "skipped", type: "boolean" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "medication_doses_medication_idx", fields: ["medicationId"] },
    { name: "medication_doses_taken_idx", fields: ["takenAt"] },
  ],
};
