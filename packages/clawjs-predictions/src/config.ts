import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadPredictionsConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "predictions",
    defaultPort: 4773,
    hasSessions: false,
    envPrefix: "PREDICTIONS",
    overrides,
  });
}
