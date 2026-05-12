import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadIncomeConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "income",
    defaultPort: 4759,
    hasSessions: false,
    envPrefix: "INCOME",
    overrides,
  });
}
