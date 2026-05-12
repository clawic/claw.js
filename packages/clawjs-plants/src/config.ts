import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadPlantsConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "plants",
    defaultPort: 4756,
    hasSessions: false,
    envPrefix: "PLANTS",
    overrides,
  });
}
