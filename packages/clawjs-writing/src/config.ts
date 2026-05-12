import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadWritingConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "writing",
    defaultPort: 4726,
    hasSessions: false,
    envPrefix: "WRITING",
    overrides,
  });
}
