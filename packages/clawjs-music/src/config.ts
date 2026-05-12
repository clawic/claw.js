import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadMusicConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "music",
    defaultPort: 4731,
    hasSessions: false,
    envPrefix: "MUSIC",
    overrides,
  });
}
