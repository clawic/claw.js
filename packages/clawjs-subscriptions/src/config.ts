import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadSubscriptionsConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "subscriptions",
    defaultPort: 4753,
    hasSessions: false,
    envPrefix: "SUBSCRIPTIONS",
    overrides,
  });
}
