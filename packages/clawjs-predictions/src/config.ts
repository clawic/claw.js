import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadPredictionsConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "predictions",
    defaultPort: 4773,
    hasSessions: false,
    envPrefix: "PREDICTIONS",
    overrides,
  });
}
