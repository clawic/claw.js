import type { BuiltinFamilyDefinition } from "../_types.ts";
import { BABY_DIAPER_CHANGES } from "./baby_diaper_changes.ts";
import { BABY_FEEDING_LOGS } from "./baby_feeding_logs.ts";
import { BABY_SLEEP_LOGS } from "./baby_sleep_logs.ts";
import { BREASTFEEDING_SESSIONS } from "./breastfeeding_sessions.ts";
import { CONTRACTIONS_LOGS } from "./contractions_logs.ts";
import { PREGNANCIES } from "./pregnancies.ts";
import { PRENATAL_VISITS } from "./prenatal_visits.ts";
import { PUMPING_SESSIONS } from "./pumping_sessions.ts";

export const PREGNANCY_EARLY_CHILDHOOD_FAMILY: BuiltinFamilyDefinition = {
  name: "pregnancy_early_childhood",
  displayName: "Pregnancy & Early Childhood",
  description: "Pregnancies, prenatal visits, contractions, baby feeding, diapers, sleep, breastfeeding, pumping.",
  collections: [BABY_DIAPER_CHANGES, BABY_FEEDING_LOGS, BABY_SLEEP_LOGS, BREASTFEEDING_SESSIONS, CONTRACTIONS_LOGS, PREGNANCIES, PRENATAL_VISITS, PUMPING_SESSIONS],
};

export { BABY_DIAPER_CHANGES, BABY_FEEDING_LOGS, BABY_SLEEP_LOGS, BREASTFEEDING_SESSIONS, CONTRACTIONS_LOGS, PREGNANCIES, PRENATAL_VISITS, PUMPING_SESSIONS };
