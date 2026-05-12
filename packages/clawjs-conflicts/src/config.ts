import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadConflictsConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "conflicts",
    defaultPort: 4738,
    hasSessions: false,
    envPrefix: "CONFLICTS",
    overrides,
  });
}
