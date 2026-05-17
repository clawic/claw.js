import type { BuiltinFamilyDefinition } from "../_types.ts";
import { ALLERGIES_DIAGNOSED } from "./allergies_diagnosed.ts";
import { CLINICS } from "./clinics.ts";
import { DIAGNOSES } from "./diagnoses.ts";
import { DOCTORS } from "./doctors.ts";
import { HEALTH_CONDITIONS } from "./health_conditions.ts";
import { LAB_RESULTS } from "./lab_results.ts";
import { LAB_VALUE_TARGETS } from "./lab_value_targets.ts";
import { MEDICAL_APPOINTMENTS } from "./medical_appointments.ts";
import { MEDICAL_COSTS_LOG } from "./medical_costs_log.ts";
import { MEDICAL_DOCUMENTS } from "./medical_documents.ts";
import { MEDICAL_PROCEDURES } from "./medical_procedures.ts";
import { MEDICATION_DOSES } from "./medication_doses.ts";
import { MEDICATIONS } from "./medications.ts";
import { MOOD_LOGS } from "./mood_logs.ts";
import { PATIENTS } from "./patients.ts";
import { PERIOD_LOGS } from "./period_logs.ts";
import { PRESCRIPTIONS } from "./prescriptions.ts";
import { REFERRALS_RECEIVED } from "./referrals_received.ts";
import { SYMPTOM_LOGS } from "./symptom_logs.ts";
import { VACCINATIONS_PERSONAL } from "./vaccinations_personal.ts";

export const HEALTH_FAMILY: BuiltinFamilyDefinition = {
  name: "health",
  displayName: "Health & Medical",
  description: "Medications, symptoms, doctors, prescriptions, lab results, diagnoses.",
  collections: [ALLERGIES_DIAGNOSED, CLINICS, DIAGNOSES, DOCTORS, HEALTH_CONDITIONS, LAB_RESULTS, LAB_VALUE_TARGETS, MEDICAL_APPOINTMENTS, MEDICAL_COSTS_LOG, MEDICAL_DOCUMENTS, MEDICAL_PROCEDURES, MEDICATION_DOSES, MEDICATIONS, MOOD_LOGS, PATIENTS, PERIOD_LOGS, PRESCRIPTIONS, REFERRALS_RECEIVED, SYMPTOM_LOGS, VACCINATIONS_PERSONAL],
};

export { ALLERGIES_DIAGNOSED, CLINICS, DIAGNOSES, DOCTORS, HEALTH_CONDITIONS, LAB_RESULTS, LAB_VALUE_TARGETS, MEDICAL_APPOINTMENTS, MEDICAL_COSTS_LOG, MEDICAL_DOCUMENTS, MEDICAL_PROCEDURES, MEDICATION_DOSES, MEDICATIONS, MOOD_LOGS, PATIENTS, PERIOD_LOGS, PRESCRIPTIONS, REFERRALS_RECEIVED, SYMPTOM_LOGS, VACCINATIONS_PERSONAL };
