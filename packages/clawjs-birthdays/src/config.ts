import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadBirthdaysConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "birthdays",
    defaultPort: 4737,
    hasSessions: false,
    envPrefix: "BIRTHDAYS",
    overrides,
  });
}
