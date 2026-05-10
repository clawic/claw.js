import type { BuiltinCollectionDefinition } from "../_types.ts";

export const PREGNANCIES: BuiltinCollectionDefinition = {
  name: "pregnancies",
  displayName: "Pregnancies",
  family: "pregnancy_early_childhood",
  aliases: ["pregnancy","pregnancies"],
  fields: [
    { name: "startedAt", type: "date", required: true },
    { name: "dueDate", type: "date" },
    { name: "endedAt", type: "date" },
    { name: "outcome", type: "select", options: ["live_birth","miscarriage","stillbirth","abortion","ongoing"] },
    { name: "partner", type: "text" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "pregnancies_outcome_idx", fields: ["outcome"] },
  ],
  rules: [
    {"kind":"compare_dates","left":"startedAt","op":"<=","right":"dueDate"},
  ],
};
