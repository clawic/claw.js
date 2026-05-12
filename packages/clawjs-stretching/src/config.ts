import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadStretchingConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "stretching",
    defaultPort: 4707,
    hasSessions: false,
    envPrefix: "STRETCHING",
    overrides,
  });
}
