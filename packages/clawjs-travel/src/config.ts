import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadTravelConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "travel",
    defaultPort: 4745,
    hasSessions: true,
    envPrefix: "TRAVEL",
    overrides,
  });
}
