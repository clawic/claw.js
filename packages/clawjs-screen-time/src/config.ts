import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadScreenTimeConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "screen-time",
    defaultPort: 4708,
    hasSessions: false,
    envPrefix: "SCREEN_TIME",
    overrides,
  });
}
