import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadCommStatsConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "comm-stats",
    defaultPort: 4744,
    hasSessions: false,
    envPrefix: "COMM_STATS",
    overrides,
  });
}
