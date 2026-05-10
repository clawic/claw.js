import type { BuiltinFamilyDefinition } from "../_types.ts";
import { PETS } from "./pets.ts";
import { PET_VET_VISITS } from "./pet_vet_visits.ts";
import { PET_VACCINATIONS } from "./pet_vaccinations.ts";
import { PET_FEEDING_SCHEDULES } from "./pet_feeding_schedules.ts";
import { PET_WEIGHT_LOGS } from "./pet_weight_logs.ts";
import { PET_MEDICATIONS } from "./pet_medications.ts";

export const PETS_FAMILY: BuiltinFamilyDefinition = {
  name: "pets",
  displayName: "Pets",
  description: "Pets, vet visits, vaccinations, feeding, weight, medications.",
  collections: [PETS, PET_VET_VISITS, PET_VACCINATIONS, PET_FEEDING_SCHEDULES, PET_WEIGHT_LOGS, PET_MEDICATIONS],
};

export { PETS, PET_VET_VISITS, PET_VACCINATIONS, PET_FEEDING_SCHEDULES, PET_WEIGHT_LOGS, PET_MEDICATIONS };
