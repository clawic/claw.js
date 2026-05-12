import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadBodyMeasuresConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "body-measures",
    defaultPort: 4705,
    hasSessions: false,
    envPrefix: "BODY_MEASURES",
    overrides,
  });
}
