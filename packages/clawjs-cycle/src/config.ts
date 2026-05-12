import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadCycleConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "cycle",
    defaultPort: 4710,
    hasSessions: false,
    envPrefix: "CYCLE",
    overrides,
  });
}
