import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadOutfitsConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "outfits",
    defaultPort: 4750,
    hasSessions: false,
    envPrefix: "OUTFITS",
    overrides,
  });
}
