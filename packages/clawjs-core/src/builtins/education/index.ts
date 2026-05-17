import type { BuiltinFamilyDefinition } from "../_types.ts";

import { LEARNERS } from "./learners.ts";

export const EDUCATION_FAMILY: BuiltinFamilyDefinition = {
  name: "education",
  displayName: "Education / LMS",
  description: "Learner profiles, course participation, assessments, progress, and education quality gaps.",
  collections: [
    LEARNERS,
  ],
};

export { LEARNERS };
