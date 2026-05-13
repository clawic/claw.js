import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadIncomeConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "income",
    defaultPort: 4759,
    hasSessions: false,
    envPrefix: "INCOME",
    overrides,
  });
}
