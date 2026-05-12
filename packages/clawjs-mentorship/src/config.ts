import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadMentorshipConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "mentorship",
    defaultPort: 4741,
    hasSessions: true,
    envPrefix: "MENTORSHIP",
    overrides,
  });
}
