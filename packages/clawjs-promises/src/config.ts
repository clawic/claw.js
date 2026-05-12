import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadPromisesConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "promises",
    defaultPort: 4771,
    hasSessions: false,
    envPrefix: "PROMISES",
    overrides,
  });
}
