import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadHealthConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "health",
    defaultPort: 4700,
    hasSessions: false,
    envPrefix: "HEALTH",
    overrides,
  });
}
