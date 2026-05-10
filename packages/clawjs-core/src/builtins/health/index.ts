import type { BuiltinFamilyDefinition } from "../_types.ts";
import { MEDICATIONS } from "./medications.ts";
import { MEDICATION_DOSES } from "./medication_doses.ts";
import { SYMPTOM_LOGS } from "./symptom_logs.ts";
import { MOOD_LOGS } from "./mood_logs.ts";
import { PERIOD_LOGS } from "./period_logs.ts";
import { DOCTORS } from "./doctors.ts";
import { CLINICS } from "./clinics.ts";
import { MEDICAL_APPOINTMENTS } from "./medical_appointments.ts";
import { PRESCRIPTIONS } from "./prescriptions.ts";
import { LAB_RESULTS } from "./lab_results.ts";
import { MEDICAL_PROCEDURES } from "./medical_procedures.ts";
import { DIAGNOSES } from "./diagnoses.ts";
import { ALLERGIES_DIAGNOSED } from "./allergies_diagnosed.ts";
import { VACCINATIONS_PERSONAL } from "./vaccinations_personal.ts";
import { HEALTH_CONDITIONS } from "./health_conditions.ts";
import { MEDICAL_DOCUMENTS } from "./medical_documents.ts";

export const HEALTH_FAMILY: BuiltinFamilyDefinition = {
  name: "health",
  displayName: "Health & Medical",
  description: "Medications, symptoms, doctors, prescriptions, lab results, diagnoses.",
  collections: [MEDICATIONS, MEDICATION_DOSES, SYMPTOM_LOGS, MOOD_LOGS, PERIOD_LOGS, DOCTORS, CLINICS, MEDICAL_APPOINTMENTS, PRESCRIPTIONS, LAB_RESULTS, MEDICAL_PROCEDURES, DIAGNOSES, ALLERGIES_DIAGNOSED, VACCINATIONS_PERSONAL, HEALTH_CONDITIONS, MEDICAL_DOCUMENTS],
};

export { MEDICATIONS, MEDICATION_DOSES, SYMPTOM_LOGS, MOOD_LOGS, PERIOD_LOGS, DOCTORS, CLINICS, MEDICAL_APPOINTMENTS, PRESCRIPTIONS, LAB_RESULTS, MEDICAL_PROCEDURES, DIAGNOSES, ALLERGIES_DIAGNOSED, VACCINATIONS_PERSONAL, HEALTH_CONDITIONS, MEDICAL_DOCUMENTS };
