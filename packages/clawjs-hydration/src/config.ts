import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadHydrationConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "hydration",
    defaultPort: 4704,
    hasSessions: false,
    envPrefix: "HYDRATION",
    overrides,
  });
}
