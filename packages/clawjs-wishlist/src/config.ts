import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadWishlistConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "wishlist",
    defaultPort: 4763,
    hasSessions: false,
    envPrefix: "WISHLIST",
    overrides,
  });
}
