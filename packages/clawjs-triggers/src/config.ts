import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadTriggersConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "triggers",
    defaultPort: 4720,
    hasSessions: false,
    envPrefix: "TRIGGERS",
    overrides,
  });
}
