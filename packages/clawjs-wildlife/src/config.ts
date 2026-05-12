import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadWildlifeConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "wildlife",
    defaultPort: 4748,
    hasSessions: false,
    envPrefix: "WILDLIFE",
    overrides,
  });
}
