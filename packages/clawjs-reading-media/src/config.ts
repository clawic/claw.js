import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadReadingMediaConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "reading-media",
    defaultPort: 4730,
    hasSessions: false,
    envPrefix: "READING_MEDIA",
    overrides,
  });
}
