import type { BuiltinFamilyDefinition } from "../_types.ts";
import { HABITS } from "./habits.ts";
import { HABIT_LOGS } from "./habit_logs.ts";
import { JOURNAL_ENTRIES } from "./journal_entries.ts";
import { GRATITUDE_ENTRIES } from "./gratitude_entries.ts";
import { INTENTIONS } from "./intentions.ts";
import { REFLECTIONS } from "./reflections.ts";
import { MOOD_CHECK_INS } from "./mood_check_ins.ts";
import { DREAM_JOURNALS } from "./dream_journals.ts";

export const HABITS_JOURNALING_FAMILY: BuiltinFamilyDefinition = {
  name: "habits_journaling",
  displayName: "Habits & Journaling",
  description: "Habits, habit logs, journal entries, gratitude, intentions, reflections.",
  collections: [HABITS, HABIT_LOGS, JOURNAL_ENTRIES, GRATITUDE_ENTRIES, INTENTIONS, REFLECTIONS, MOOD_CHECK_INS, DREAM_JOURNALS],
};

export { HABITS, HABIT_LOGS, JOURNAL_ENTRIES, GRATITUDE_ENTRIES, INTENTIONS, REFLECTIONS, MOOD_CHECK_INS, DREAM_JOURNALS };
