import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadQuotesConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "quotes",
    defaultPort: 4775,
    hasSessions: false,
    envPrefix: "QUOTES",
    overrides,
  });
}
