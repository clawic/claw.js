import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadDonationsConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "donations",
    defaultPort: 4742,
    hasSessions: false,
    envPrefix: "DONATIONS",
    overrides,
  });
}
