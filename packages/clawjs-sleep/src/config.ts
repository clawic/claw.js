import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadSleepConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "sleep",
    defaultPort: 4701,
    hasSessions: true,
    envPrefix: "SLEEP",
    overrides,
  });
}
