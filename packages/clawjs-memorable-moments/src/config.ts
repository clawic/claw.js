import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadMemorableMomentsConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "memorable-moments",
    defaultPort: 4718,
    hasSessions: false,
    envPrefix: "MEMORABLE_MOMENTS",
    overrides,
  });
}
