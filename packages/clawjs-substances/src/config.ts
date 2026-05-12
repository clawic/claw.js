import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadSubstancesConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "substances",
    defaultPort: 4703,
    hasSessions: false,
    envPrefix: "SUBSTANCES",
    overrides,
  });
}
