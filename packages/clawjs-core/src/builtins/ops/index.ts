import type { BuiltinFamilyDefinition } from "../_types.ts";

import { SERVICES } from "./services.ts";
import { INCIDENTS } from "./incidents.ts";

export const OPS_FAMILY: BuiltinFamilyDefinition = {
  name: "ops",
  displayName: "Operations / ITSM",
  description: "Operational services, incidents, evidence, ownership, dependencies, and timeline-ready records.",
  collections: [
    SERVICES,
    INCIDENTS,
  ],
};

export { SERVICES, INCIDENTS };
