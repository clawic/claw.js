import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadFinanceConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "finance",
    defaultPort: 4760,
    hasSessions: false,
    envPrefix: "FINANCE",
    overrides,
  });
}
