import type { BuiltinFamilyDefinition } from "../_types.ts";

import { FAVORITES } from "./favorites.ts";
import { AUTOMATIONS } from "./automations.ts";
import { AUTOMATION_RECIPES } from "./automation_recipes.ts";
import { SLA_POLICIES } from "./sla_policies.ts";
import { ISSUE_SLA_STATE } from "./issue_sla_state.ts";
import { GIT_AUTOMATION_STATES } from "./git_automation_states.ts";

export const FLOW_FAMILY: BuiltinFamilyDefinition = {
  name: "flow",
  displayName: "Flow Configuration",
  description: "Favorites, automations, SLA policies and Git automation per team.",
  collections: [
    FAVORITES,
    AUTOMATIONS,
    AUTOMATION_RECIPES,
    SLA_POLICIES,
    ISSUE_SLA_STATE,
    GIT_AUTOMATION_STATES,
  ],
};

export { FAVORITES, AUTOMATIONS, AUTOMATION_RECIPES, SLA_POLICIES, ISSUE_SLA_STATE, GIT_AUTOMATION_STATES };
