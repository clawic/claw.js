import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadPainMapConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "pain-map",
    defaultPort: 4706,
    hasSessions: false,
    envPrefix: "PAIN_MAP",
    overrides,
  });
}
