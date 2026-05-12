import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadBookmarksConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "bookmarks",
    defaultPort: 4733,
    hasSessions: false,
    envPrefix: "BOOKMARKS",
    overrides,
  });
}
