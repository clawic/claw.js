import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadNutritionConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "nutrition",
    defaultPort: 4702,
    hasSessions: false,
    envPrefix: "NUTRITION",
    overrides,
  });
}
