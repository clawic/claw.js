import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadJournalConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "journal",
    defaultPort: 4715,
    hasSessions: true,
    envPrefix: "JOURNAL",
    overrides,
  });
}
