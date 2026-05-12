import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadCritiquesConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "critiques",
    defaultPort: 4722,
    hasSessions: false,
    envPrefix: "CRITIQUES",
    overrides,
  });
}
