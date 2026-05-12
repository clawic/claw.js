import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadWorkoutsConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "workouts",
    defaultPort: 4713,
    hasSessions: true,
    envPrefix: "WORKOUTS",
    overrides,
  });
}
