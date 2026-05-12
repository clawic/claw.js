import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadComplimentsConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "compliments",
    defaultPort: 4779,
    hasSessions: false,
    envPrefix: "COMPLIMENTS",
    overrides,
  });
}
