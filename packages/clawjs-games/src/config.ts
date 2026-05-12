import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadGamesConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "games",
    defaultPort: 4732,
    hasSessions: true,
    envPrefix: "GAMES",
    overrides,
  });
}
