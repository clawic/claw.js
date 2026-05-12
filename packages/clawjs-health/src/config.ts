import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadHealthConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "health",
    defaultPort: 4700,
    hasSessions: false,
    envPrefix: "HEALTH",
    overrides,
  });
}
