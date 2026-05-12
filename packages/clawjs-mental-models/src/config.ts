import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadMentalModelsConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "mental-models",
    defaultPort: 4766,
    hasSessions: false,
    envPrefix: "MENTAL_MODELS",
    overrides,
  });
}
