import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadHabitsConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "habits",
    defaultPort: 4723,
    hasSessions: false,
    envPrefix: "HABITS",
    overrides,
  });
}
