import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadDreamsConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "dreams",
    defaultPort: 4716,
    hasSessions: false,
    envPrefix: "DREAMS",
    overrides,
  });
}
