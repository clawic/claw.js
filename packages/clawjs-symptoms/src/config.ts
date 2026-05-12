import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadSymptomsConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "symptoms",
    defaultPort: 4712,
    hasSessions: false,
    envPrefix: "SYMPTOMS",
    overrides,
  });
}
