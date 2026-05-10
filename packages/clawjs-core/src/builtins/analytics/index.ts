import type { BuiltinFamilyDefinition } from "../_types.ts";

import { ANALYTICS_EVENTS } from "./analytics_events.ts";
import { ANALYTICS_PERSONS } from "./analytics_persons.ts";
import { ANALYTICS_GROUPS } from "./analytics_groups.ts";
import { COHORTS } from "./cohorts.ts";
import { COHORT_MEMBERSHIPS } from "./cohort_memberships.ts";
import { FUNNELS } from "./funnels.ts";
import { FUNNEL_RUNS } from "./funnel_runs.ts";
import { RETENTION_ANALYSES } from "./retention_analyses.ts";
import { FEATURE_FLAGS } from "./feature_flags.ts";
import { FEATURE_FLAG_EVALUATIONS } from "./feature_flag_evaluations.ts";
import { EXPERIMENTS } from "./experiments.ts";
import { EXPERIMENT_METRICS } from "./experiment_metrics.ts";
import { SEGMENTS } from "./segments.ts";
import { HOLDOUTS } from "./holdouts.ts";
import { SURVEYS } from "./surveys.ts";
import { SURVEY_RESPONSES } from "./survey_responses.ts";
import { SESSION_RECORDINGS } from "./session_recordings.ts";
import { DASHBOARDS } from "./dashboards.ts";
import { INSIGHT_DEFINITIONS } from "./insight_definitions.ts";

export const ANALYTICS_FAMILY: BuiltinFamilyDefinition = {
  name: "analytics",
  displayName: "Product Analytics",
  description: "Events, persons, cohorts, funnels, retention, feature flags, experiments, surveys and dashboards.",
  collections: [
    ANALYTICS_EVENTS,
    ANALYTICS_PERSONS,
    ANALYTICS_GROUPS,
    COHORTS,
    COHORT_MEMBERSHIPS,
    FUNNELS,
    FUNNEL_RUNS,
    RETENTION_ANALYSES,
    FEATURE_FLAGS,
    FEATURE_FLAG_EVALUATIONS,
    EXPERIMENTS,
    EXPERIMENT_METRICS,
    SEGMENTS,
    HOLDOUTS,
    SURVEYS,
    SURVEY_RESPONSES,
    SESSION_RECORDINGS,
    DASHBOARDS,
    INSIGHT_DEFINITIONS,
  ],
};

export { ANALYTICS_EVENTS, ANALYTICS_PERSONS, ANALYTICS_GROUPS, COHORTS, COHORT_MEMBERSHIPS, FUNNELS, FUNNEL_RUNS, RETENTION_ANALYSES, FEATURE_FLAGS, FEATURE_FLAG_EVALUATIONS, EXPERIMENTS, EXPERIMENT_METRICS, SEGMENTS, HOLDOUTS, SURVEYS, SURVEY_RESPONSES, SESSION_RECORDINGS, DASHBOARDS, INSIGHT_DEFINITIONS };
