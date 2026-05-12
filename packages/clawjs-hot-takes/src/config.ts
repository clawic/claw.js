import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadHotTakesConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "hot-takes",
    defaultPort: 4770,
    hasSessions: false,
    envPrefix: "HOT_TAKES",
    overrides,
  });
}
