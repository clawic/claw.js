import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadPromisesConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "promises",
    defaultPort: 4771,
    hasSessions: false,
    envPrefix: "PROMISES",
    overrides,
  });
}
