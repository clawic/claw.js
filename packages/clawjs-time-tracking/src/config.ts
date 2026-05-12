import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadTimeTrackingConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "time-tracking",
    defaultPort: 4724,
    hasSessions: true,
    envPrefix: "TIME_TRACKING",
    overrides,
  });
}
