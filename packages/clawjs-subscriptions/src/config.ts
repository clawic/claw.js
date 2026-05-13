import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadSubscriptionsConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "subscriptions",
    defaultPort: 4753,
    hasSessions: false,
    envPrefix: "SUBSCRIPTIONS",
    overrides,
  });
}
