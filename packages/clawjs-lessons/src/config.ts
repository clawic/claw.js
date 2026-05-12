import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadLessonsConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "lessons",
    defaultPort: 4765,
    hasSessions: false,
    envPrefix: "LESSONS",
    overrides,
  });
}
