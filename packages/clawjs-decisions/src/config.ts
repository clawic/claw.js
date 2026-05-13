import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadDecisionsConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "decisions",
    defaultPort: 4774,
    hasSessions: false,
    envPrefix: "DECISIONS",
    overrides,
  });
}
