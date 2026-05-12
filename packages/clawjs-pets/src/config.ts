import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadPetsConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "pets",
    defaultPort: 4754,
    hasSessions: false,
    envPrefix: "PETS",
    overrides,
  });
}
