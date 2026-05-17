import type { BuiltinFamilyDefinition } from "../_types.ts";

import { STUDIES } from "./studies.ts";
import { PARTICIPANTS } from "./participants.ts";

export const RESEARCH_FAMILY: BuiltinFamilyDefinition = {
  name: "research",
  displayName: "Research / CTMS",
  description: "Research studies, participants, cohorts, consent state, evidence, and analysis readiness.",
  collections: [
    STUDIES,
    PARTICIPANTS,
  ],
};

export { STUDIES, PARTICIPANTS };
