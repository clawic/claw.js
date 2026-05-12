import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadAchievementsConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "achievements",
    defaultPort: 4764,
    hasSessions: false,
    envPrefix: "ACHIEVEMENTS",
    overrides,
  });
}
