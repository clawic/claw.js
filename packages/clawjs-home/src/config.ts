import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadHomeConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "home",
    defaultPort: 4755,
    hasSessions: false,
    envPrefix: "HOME",
    overrides,
  });
}
