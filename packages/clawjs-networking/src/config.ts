import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadNetworkingConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "networking",
    defaultPort: 4740,
    hasSessions: false,
    envPrefix: "NETWORKING",
    overrides,
  });
}
