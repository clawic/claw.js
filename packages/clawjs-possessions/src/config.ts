import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadPossessionsConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "possessions",
    defaultPort: 4751,
    hasSessions: false,
    envPrefix: "POSSESSIONS",
    overrides,
  });
}
