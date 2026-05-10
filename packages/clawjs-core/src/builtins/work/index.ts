import type { BuiltinFamilyDefinition } from "../_types.ts";

import { WORKFLOW_STATES } from "./workflow_states.ts";
import { ENTITY_RELATIONS } from "./entity_relations.ts";
import { LABELS } from "./labels.ts";
import { ENTITY_LABELS } from "./entity_labels.ts";
import { COMPONENTS } from "./components.ts";
import { ENTITY_COMPONENTS } from "./entity_components.ts";
import { VERSIONS } from "./versions.ts";
import { ISSUE_AFFECTS_VERSIONS } from "./issue_affects_versions.ts";

export const WORK_FAMILY: BuiltinFamilyDefinition = {
  name: "work",
  displayName: "Work Tracking",
  description: "Configurable workflow states, typed issue relations, labels, components and product versions.",
  collections: [
    WORKFLOW_STATES,
    ENTITY_RELATIONS,
    LABELS,
    ENTITY_LABELS,
    COMPONENTS,
    ENTITY_COMPONENTS,
    VERSIONS,
    ISSUE_AFFECTS_VERSIONS,
  ],
};

export { WORKFLOW_STATES, ENTITY_RELATIONS, LABELS, ENTITY_LABELS, COMPONENTS, ENTITY_COMPONENTS, VERSIONS, ISSUE_AFFECTS_VERSIONS };
