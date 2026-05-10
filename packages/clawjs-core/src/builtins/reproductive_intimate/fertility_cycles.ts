import type { BuiltinCollectionDefinition } from "../_types.ts";

export const FERTILITY_CYCLES: BuiltinCollectionDefinition = {
  name: "fertility_cycles",
  displayName: "Fertility Cycles",
  family: "reproductive_intimate",
  aliases: ["fertility_cycle","fertility_cycles"],
  fields: [
    { name: "cycleNumber", type: "number" },
    { name: "startedAt", type: "date", required: true },
    { name: "endedAt", type: "date" },
    { name: "ovulationAt", type: "date" },
    { name: "lutealPhaseDays", type: "number" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "fertility_cycles_started_idx", fields: ["startedAt"] },
  ],
  rules: [
    {"kind":"compare_dates","left":"startedAt","op":"<=","right":"endedAt"},
  ],
};
