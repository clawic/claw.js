import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadPossessionsConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "possessions",
    defaultPort: 4751,
    hasSessions: false,
    envPrefix: "POSSESSIONS",
    overrides,
  });
}
