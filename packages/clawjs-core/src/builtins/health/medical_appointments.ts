import type { BuiltinCollectionDefinition } from "../_types.ts";

export const MEDICAL_APPOINTMENTS: BuiltinCollectionDefinition = {
  name: "medical_appointments",
  displayName: "Medical Appointments",
  family: "health",
  aliases: ["medical_appointment","medical_appointments"],
  fields: [
    { name: "scheduledAt", type: "date", required: true },
    { name: "doctorId", type: "relation", relation: { collectionName: "doctors" } },
    { name: "clinicId", type: "relation", relation: { collectionName: "clinics" } },
    { name: "reason", type: "text" },
    { name: "status", type: "select", options: ["scheduled","completed","cancelled","no_show"] },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "medical_appointments_scheduled_idx", fields: ["scheduledAt"] },
    { name: "medical_appointments_status_idx", fields: ["status"] },
  ],
};
