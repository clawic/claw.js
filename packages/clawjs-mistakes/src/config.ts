import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadMistakesConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "mistakes",
    defaultPort: 4721,
    hasSessions: false,
    envPrefix: "MISTAKES",
    overrides,
  });
}
