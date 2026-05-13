import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadMistakesConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "mistakes",
    defaultPort: 4721,
    hasSessions: false,
    envPrefix: "MISTAKES",
    overrides,
  });
}
