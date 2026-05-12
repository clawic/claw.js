import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadBeliefsConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "beliefs",
    defaultPort: 4768,
    hasSessions: false,
    envPrefix: "BELIEFS",
    overrides,
  });
}
