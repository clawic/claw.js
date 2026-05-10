import type { BuiltinFamilyDefinition } from "../_types.ts";
import { BEAUTY_APPOINTMENTS } from "./beauty_appointments.ts";
import { DEPILATION_LOGS } from "./depilation_logs.ts";
import { EYEWEAR } from "./eyewear.ts";
import { FRAGRANCES_OWNED } from "./fragrances_owned.ts";
import { HAIR_LOGS } from "./hair_logs.ts";
import { MAKEUP_CATALOG } from "./makeup_catalog.ts";
import { SKINCARE_LOGS } from "./skincare_logs.ts";
import { SKINCARE_ROUTINES } from "./skincare_routines.ts";

export const PERSONAL_CARE_AESTHETICS_FAMILY: BuiltinFamilyDefinition = {
  name: "personal_care_aesthetics",
  displayName: "Personal Care & Aesthetics",
  description: "Skincare routines, beauty appointments, fragrances, makeup, eyewear, hair logs, depilation.",
  collections: [BEAUTY_APPOINTMENTS, DEPILATION_LOGS, EYEWEAR, FRAGRANCES_OWNED, HAIR_LOGS, MAKEUP_CATALOG, SKINCARE_LOGS, SKINCARE_ROUTINES],
};

export { BEAUTY_APPOINTMENTS, DEPILATION_LOGS, EYEWEAR, FRAGRANCES_OWNED, HAIR_LOGS, MAKEUP_CATALOG, SKINCARE_LOGS, SKINCARE_ROUTINES };
