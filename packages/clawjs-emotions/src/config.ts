import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadEmotionsConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "emotions",
    defaultPort: 4714,
    hasSessions: false,
    envPrefix: "EMOTIONS",
    overrides,
  });
}
