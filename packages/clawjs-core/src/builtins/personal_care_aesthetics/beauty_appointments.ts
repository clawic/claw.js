import type { BuiltinCollectionDefinition } from "../_types.ts";

export const BEAUTY_APPOINTMENTS: BuiltinCollectionDefinition = {
  name: "beauty_appointments",
  displayName: "Beauty Appointments",
  family: "personal_care_aesthetics",
  aliases: ["beauty_appointment","beauty_appointments"],
  fields: [
    { name: "kind", type: "select", options: ["hair","nails","wax","facial","massage","spa","botox","filler","laser","tanning","other"] },
    { name: "salon", type: "text" },
    { name: "scheduledAt", type: "date", required: true },
    { name: "cost", type: "money" },
    { name: "rating", type: "rating", enumScale: 5 },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "beauty_appointments_scheduled_idx", fields: ["scheduledAt"] },
  ],
};
