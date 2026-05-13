import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadGoalsConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "goals",
    defaultPort: 4762,
    hasSessions: false,
    envPrefix: "GOALS",
    overrides,
  });
}
