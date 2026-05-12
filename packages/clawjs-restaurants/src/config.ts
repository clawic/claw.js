import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadRestaurantsConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "restaurants",
    defaultPort: 4734,
    hasSessions: false,
    envPrefix: "RESTAURANTS",
    overrides,
  });
}
