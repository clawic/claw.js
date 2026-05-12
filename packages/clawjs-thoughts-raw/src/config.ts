import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadThoughtsRawConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "thoughts-raw",
    defaultPort: 4717,
    hasSessions: false,
    envPrefix: "THOUGHTS_RAW",
    overrides,
  });
}
