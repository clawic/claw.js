import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadCognitionConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "cognition",
    defaultPort: 4761,
    hasSessions: false,
    envPrefix: "COGNITION",
    overrides,
  });
}
