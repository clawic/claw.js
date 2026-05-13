import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadTimeTrackingConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "time-tracking",
    defaultPort: 4724,
    hasSessions: true,
    envPrefix: "TIME_TRACKING",
    overrides,
  });
}
