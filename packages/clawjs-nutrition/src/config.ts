import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadNutritionConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "nutrition",
    defaultPort: 4702,
    hasSessions: false,
    envPrefix: "NUTRITION",
    overrides,
  });
}
