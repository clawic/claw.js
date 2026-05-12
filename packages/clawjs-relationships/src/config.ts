import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadRelationshipsConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "relationships",
    defaultPort: 4736,
    hasSessions: false,
    envPrefix: "RELATIONSHIPS",
    overrides,
  });
}
