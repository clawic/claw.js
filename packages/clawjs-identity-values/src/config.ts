import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadIdentityValuesConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "identity-values",
    defaultPort: 4767,
    hasSessions: false,
    envPrefix: "IDENTITY_VALUES",
    overrides,
  });
}
