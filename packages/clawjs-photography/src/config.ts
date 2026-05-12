import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadPhotographyConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "photography",
    defaultPort: 4727,
    hasSessions: false,
    envPrefix: "PHOTOGRAPHY",
    overrides,
  });
}
