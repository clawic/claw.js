import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadGpsLogConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "gps-log",
    defaultPort: 4746,
    hasSessions: false,
    envPrefix: "GPS_LOG",
    overrides,
  });
}
