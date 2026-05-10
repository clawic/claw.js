import type { BuiltinFamilyDefinition } from "../_types.ts";

import { ERROR_ISSUES } from "./error_issues.ts";
import { ERROR_EVENTS } from "./error_events.ts";
import { ALERT_RULES } from "./alert_rules.ts";
import { MONITORS } from "./monitors.ts";
import { SLOS } from "./slos.ts";
import { SLO_CALCULATIONS } from "./slo_calculations.ts";
import { SUSPECT_COMMITS } from "./suspect_commits.ts";
import { REPLAYS } from "./replays.ts";
import { SPANS } from "./spans.ts";
import { CODE_OWNERS } from "./code_owners.ts";

export const OBSERVABILITY_FAMILY: BuiltinFamilyDefinition = {
  name: "observability",
  displayName: "Observability",
  description: "Error issues, traces, alerts, monitors, SLOs, replays and code owners.",
  collections: [
    ERROR_ISSUES,
    ERROR_EVENTS,
    ALERT_RULES,
    MONITORS,
    SLOS,
    SLO_CALCULATIONS,
    SUSPECT_COMMITS,
    REPLAYS,
    SPANS,
    CODE_OWNERS,
  ],
};

export { ERROR_ISSUES, ERROR_EVENTS, ALERT_RULES, MONITORS, SLOS, SLO_CALCULATIONS, SUSPECT_COMMITS, REPLAYS, SPANS, CODE_OWNERS };
