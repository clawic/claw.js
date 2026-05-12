import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadCareerConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "career",
    defaultPort: 4758,
    hasSessions: false,
    envPrefix: "CAREER",
    overrides,
  });
}
