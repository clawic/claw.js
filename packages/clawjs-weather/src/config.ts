import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadWeatherConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "weather",
    defaultPort: 4747,
    hasSessions: false,
    envPrefix: "WEATHER",
    overrides,
  });
}
