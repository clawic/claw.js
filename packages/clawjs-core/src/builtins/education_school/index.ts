import type { BuiltinFamilyDefinition } from "../_types.ts";
import { SUBJECTS } from "./subjects.ts";
import { CLASSES } from "./classes.ts";
import { ASSIGNMENTS } from "./assignments.ts";
import { EXAMS } from "./exams.ts";
import { SCHOOL_GRADES } from "./school_grades.ts";
import { STUDY_PLANS } from "./study_plans.ts";
import { SCHOOL_CALENDAR_ENTRIES } from "./school_calendar_entries.ts";
import { TEACHERS } from "./teachers.ts";
import { SCHOOLS } from "./schools.ts";

export const EDUCATION_SCHOOL_FAMILY: BuiltinFamilyDefinition = {
  name: "education_school",
  displayName: "Education & School",
  description: "Subjects, classes, assignments, exams, grades, study plans.",
  collections: [SUBJECTS, CLASSES, ASSIGNMENTS, EXAMS, SCHOOL_GRADES, STUDY_PLANS, SCHOOL_CALENDAR_ENTRIES, TEACHERS, SCHOOLS],
};

export { SUBJECTS, CLASSES, ASSIGNMENTS, EXAMS, SCHOOL_GRADES, STUDY_PLANS, SCHOOL_CALENDAR_ENTRIES, TEACHERS, SCHOOLS };
