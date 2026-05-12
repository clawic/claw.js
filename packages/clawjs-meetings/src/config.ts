import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadMeetingsConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "meetings",
    defaultPort: 4725,
    hasSessions: true,
    envPrefix: "MEETINGS",
    overrides,
  });
}
