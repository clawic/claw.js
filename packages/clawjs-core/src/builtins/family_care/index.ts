import type { BuiltinFamilyDefinition } from "../_types.ts";
import { FAMILY_MEMBERS } from "./family_members.ts";
import { CHILDREN_PROFILES } from "./children_profiles.ts";
import { CHILD_MILESTONES } from "./child_milestones.ts";
import { CHILD_GROWTH_LOGS } from "./child_growth_logs.ts";
import { SCHOOL_EVENTS } from "./school_events.ts";
import { CAREGIVERS } from "./caregivers.ts";
import { DEPENDENTS } from "./dependents.ts";
import { FAMILY_DOCUMENTS } from "./family_documents.ts";

export const FAMILY_CARE_FAMILY: BuiltinFamilyDefinition = {
  name: "family_care",
  displayName: "Family & Care",
  description: "Family members, kids, milestones, caregivers, dependents.",
  collections: [FAMILY_MEMBERS, CHILDREN_PROFILES, CHILD_MILESTONES, CHILD_GROWTH_LOGS, SCHOOL_EVENTS, CAREGIVERS, DEPENDENTS, FAMILY_DOCUMENTS],
};

export { FAMILY_MEMBERS, CHILDREN_PROFILES, CHILD_MILESTONES, CHILD_GROWTH_LOGS, SCHOOL_EVENTS, CAREGIVERS, DEPENDENTS, FAMILY_DOCUMENTS };
