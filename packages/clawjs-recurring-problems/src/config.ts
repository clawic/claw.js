import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadRecurringProblemsConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "recurring-problems",
    defaultPort: 4719,
    hasSessions: false,
    envPrefix: "RECURRING_PROBLEMS",
    overrides,
  });
}
