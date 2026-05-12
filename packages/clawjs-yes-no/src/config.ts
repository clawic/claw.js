import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadYesNoConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "yes-no",
    defaultPort: 4772,
    hasSessions: false,
    envPrefix: "YES_NO",
    overrides,
  });
}
