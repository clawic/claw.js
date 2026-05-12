import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadVolunteeringConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "volunteering",
    defaultPort: 4743,
    hasSessions: true,
    envPrefix: "VOLUNTEERING",
    overrides,
  });
}
