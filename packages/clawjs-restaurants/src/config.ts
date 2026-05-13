import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadRestaurantsConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "restaurants",
    defaultPort: 4734,
    hasSessions: false,
    envPrefix: "RESTAURANTS",
    overrides,
  });
}
