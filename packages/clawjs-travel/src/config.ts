import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadTravelConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "travel",
    defaultPort: 4745,
    hasSessions: true,
    envPrefix: "TRAVEL",
    overrides,
  });
}
