import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadSpiritualityConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "spirituality",
    defaultPort: 4776,
    hasSessions: true,
    envPrefix: "SPIRITUALITY",
    overrides,
  });
}
