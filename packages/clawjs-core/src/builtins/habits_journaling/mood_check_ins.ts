import type { BuiltinCollectionDefinition } from "../_types.ts";

export const MOOD_CHECK_INS: BuiltinCollectionDefinition = {
  name: "mood_check_ins",
  displayName: "Mood Check-Ins",
  family: "habits_journaling",
  aliases: ["mood_check_in","mood_check_ins","checkin"],
  fields: [
    { name: "loggedAt", type: "date", required: true },
    { name: "mood", type: "select", options: ["terrible","bad","neutral","good","great"] },
    { name: "stress", type: "number" },
    { name: "energy", type: "number" },
    { name: "tags", type: "json" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "mood_check_ins_logged_idx", fields: ["loggedAt"] },
  ],
};
