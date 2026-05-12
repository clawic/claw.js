import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadLearningConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "learning",
    defaultPort: 4777,
    hasSessions: true,
    envPrefix: "LEARNING",
    overrides,
  });
}
