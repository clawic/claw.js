import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadCritiquesConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "critiques",
    defaultPort: 4722,
    hasSessions: false,
    envPrefix: "CRITIQUES",
    overrides,
  });
}
