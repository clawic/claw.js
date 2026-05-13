import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadSubstancesConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "substances",
    defaultPort: 4703,
    hasSessions: false,
    envPrefix: "SUBSTANCES",
    overrides,
  });
}
