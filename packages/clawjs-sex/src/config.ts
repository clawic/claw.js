import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadSexConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "sex",
    defaultPort: 4711,
    hasSessions: false,
    envPrefix: "SEX",
    overrides,
  });
}
