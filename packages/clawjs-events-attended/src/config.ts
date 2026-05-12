import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadEventsAttendedConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "events-attended",
    defaultPort: 4735,
    hasSessions: true,
    envPrefix: "EVENTS_ATTENDED",
    overrides,
  });
}
