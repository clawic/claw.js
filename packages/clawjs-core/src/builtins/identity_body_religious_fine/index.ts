import type { BuiltinFamilyDefinition } from "../_types.ts";
import { ADVOCACY_LOG } from "./advocacy_log.ts";
import { BODY_MODIFICATIONS } from "./body_modifications.ts";
import { FASTING_LOG } from "./fasting_log.ts";
import { HAIR_CHANGES } from "./hair_changes.ts";
import { IDENTITY_JOURNEY_MILESTONES } from "./identity_journey_milestones.ts";
import { PRAYER_LOG_GRANULAR } from "./prayer_log_granular.ts";
import { SCRIPTURE_READING_LOG } from "./scripture_reading_log.ts";

export const IDENTITY_BODY_RELIGIOUS_FINE_FAMILY: BuiltinFamilyDefinition = {
  name: "identity_body_religious_fine",
  displayName: "Identity, Body & Religious Practices",
  description: "Body modifications, hair changes, granular prayer log, fasting, scripture reading, identity milestones, advocacy.",
  collections: [ADVOCACY_LOG, BODY_MODIFICATIONS, FASTING_LOG, HAIR_CHANGES, IDENTITY_JOURNEY_MILESTONES, PRAYER_LOG_GRANULAR, SCRIPTURE_READING_LOG],
};

export { ADVOCACY_LOG, BODY_MODIFICATIONS, FASTING_LOG, HAIR_CHANGES, IDENTITY_JOURNEY_MILESTONES, PRAYER_LOG_GRANULAR, SCRIPTURE_READING_LOG };
