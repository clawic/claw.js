import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadDecisionsConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "decisions",
    defaultPort: 4774,
    hasSessions: false,
    envPrefix: "DECISIONS",
    overrides,
  });
}
