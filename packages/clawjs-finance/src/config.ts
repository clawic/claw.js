import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadFinanceConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "finance",
    defaultPort: 4760,
    hasSessions: false,
    envPrefix: "FINANCE",
    overrides,
  });
}
