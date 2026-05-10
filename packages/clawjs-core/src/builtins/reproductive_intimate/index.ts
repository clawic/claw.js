import type { BuiltinFamilyDefinition } from "../_types.ts";
import { BBT_LOGS } from "./bbt_logs.ts";
import { CONTRACEPTIVE_USE } from "./contraceptive_use.ts";
import { FERTILITY_CYCLES } from "./fertility_cycles.ts";
import { INTIMATE_ENCOUNTERS } from "./intimate_encounters.ts";
import { IVF_CYCLES } from "./ivf_cycles.ts";
import { OVULATION_TESTS } from "./ovulation_tests.ts";
import { PREGNANCY_LOSSES } from "./pregnancy_losses.ts";
import { STI_TESTS } from "./sti_tests.ts";
import { TTC_LOGS } from "./ttc_logs.ts";

export const REPRODUCTIVE_INTIMATE_FAMILY: BuiltinFamilyDefinition = {
  name: "reproductive_intimate",
  displayName: "Reproductive & Intimate Health",
  description: "Fertility cycles, BBT, ovulation tests, TTC, pregnancy losses, IVF, STI tests, contraceptives, intimate encounters.",
  collections: [BBT_LOGS, CONTRACEPTIVE_USE, FERTILITY_CYCLES, INTIMATE_ENCOUNTERS, IVF_CYCLES, OVULATION_TESTS, PREGNANCY_LOSSES, STI_TESTS, TTC_LOGS],
};

export { BBT_LOGS, CONTRACEPTIVE_USE, FERTILITY_CYCLES, INTIMATE_ENCOUNTERS, IVF_CYCLES, OVULATION_TESTS, PREGNANCY_LOSSES, STI_TESTS, TTC_LOGS };
