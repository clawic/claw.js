import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadYearReviewsConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "year-reviews",
    defaultPort: 4778,
    hasSessions: true,
    envPrefix: "YEAR_REVIEWS",
    overrides,
  });
}
