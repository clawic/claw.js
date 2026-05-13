import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadPlantsConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "plants",
    defaultPort: 4756,
    hasSessions: false,
    envPrefix: "PLANTS",
    overrides,
  });
}
