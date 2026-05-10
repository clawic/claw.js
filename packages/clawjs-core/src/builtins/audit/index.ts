import type { BuiltinFamilyDefinition } from "../_types.ts";

import { PULSE_UPDATES } from "./pulse_updates.ts";
import { PROJECT_UPDATES } from "./project_updates.ts";
import { INITIATIVE_UPDATES } from "./initiative_updates.ts";
import { INITIATIVE_PARENTS } from "./initiative_parents.ts";

export const AUDIT_FAMILY: BuiltinFamilyDefinition = {
  name: "audit",
  displayName: "Audit & Project Health",
  description: "Project & initiative health updates, pulses and multi-parent initiative graph.",
  collections: [
    PULSE_UPDATES,
    PROJECT_UPDATES,
    INITIATIVE_UPDATES,
    INITIATIVE_PARENTS,
  ],
};

export { PULSE_UPDATES, PROJECT_UPDATES, INITIATIVE_UPDATES, INITIATIVE_PARENTS };
