import type { BuiltinCollectionDefinition } from "../_types.ts";

export const PRENATAL_VISITS: BuiltinCollectionDefinition = {
  name: "prenatal_visits",
  displayName: "Prenatal Visits",
  family: "pregnancy_early_childhood",
  aliases: ["prenatal_visit","prenatal_visits"],
  fields: [
    { name: "pregnancyId", type: "relation", required: true, relation: { collectionName: "pregnancies" } },
    { name: "doctorId", type: "relation", relation: { collectionName: "doctors" } },
    { name: "scheduledAt", type: "date", required: true },
    { name: "week", type: "number" },
    { name: "weightKg", type: "number" },
    { name: "bloodPressure", type: "text" },
    { name: "fetalHeartRate", type: "number" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "prenatal_visits_pregnancy_idx", fields: ["pregnancyId"] },
  ],
};
