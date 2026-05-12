import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadSkyConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "sky",
    defaultPort: 4749,
    hasSessions: false,
    envPrefix: "SKY",
    overrides,
  });
}
