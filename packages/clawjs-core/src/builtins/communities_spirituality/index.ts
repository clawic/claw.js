import type { BuiltinFamilyDefinition } from "../_types.ts";
import { COMMUNITIES_MEMBERSHIP } from "./communities_membership.ts";
import { VOLUNTEER_ACTIVITIES } from "./volunteer_activities.ts";
import { DONATIONS } from "./donations.ts";
import { MEDITATIONS } from "./meditations.ts";
import { SPIRITUAL_PRACTICES } from "./spiritual_practices.ts";
import { RETREATS_ATTENDED } from "./retreats_attended.ts";
import { RELIGIOUS_PRACTICES } from "./religious_practices.ts";

export const COMMUNITIES_SPIRITUALITY_FAMILY: BuiltinFamilyDefinition = {
  name: "communities_spirituality",
  displayName: "Communities, Volunteering & Spirituality",
  description: "Memberships, volunteering, donations, meditations, retreats.",
  collections: [COMMUNITIES_MEMBERSHIP, VOLUNTEER_ACTIVITIES, DONATIONS, MEDITATIONS, SPIRITUAL_PRACTICES, RETREATS_ATTENDED, RELIGIOUS_PRACTICES],
};

export { COMMUNITIES_MEMBERSHIP, VOLUNTEER_ACTIVITIES, DONATIONS, MEDITATIONS, SPIRITUAL_PRACTICES, RETREATS_ATTENDED, RELIGIOUS_PRACTICES };
