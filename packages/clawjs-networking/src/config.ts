import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadNetworkingConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "networking",
    defaultPort: 4740,
    hasSessions: false,
    envPrefix: "NETWORKING",
    overrides,
  });
}
