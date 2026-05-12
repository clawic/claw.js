import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadGoalsConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "goals",
    defaultPort: 4762,
    hasSessions: false,
    envPrefix: "GOALS",
    overrides,
  });
}
