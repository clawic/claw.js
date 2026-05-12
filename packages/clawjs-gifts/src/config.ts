import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadGiftsConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "gifts",
    defaultPort: 4752,
    hasSessions: false,
    envPrefix: "GIFTS",
    overrides,
  });
}
