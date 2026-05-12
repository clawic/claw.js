import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadPersonalityTestsConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "personality-tests",
    defaultPort: 4769,
    hasSessions: false,
    envPrefix: "PERSONALITY_TESTS",
    overrides,
  });
}
