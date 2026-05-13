import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadMentalModelsConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "mental-models",
    defaultPort: 4766,
    hasSessions: false,
    envPrefix: "MENTAL_MODELS",
    overrides,
  });
}
