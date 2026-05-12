import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadDatingConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "dating",
    defaultPort: 4739,
    hasSessions: true,
    envPrefix: "DATING",
    overrides,
  });
}
