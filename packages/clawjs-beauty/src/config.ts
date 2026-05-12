import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadBeautyConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "beauty",
    defaultPort: 4709,
    hasSessions: false,
    envPrefix: "BEAUTY",
    overrides,
  });
}
