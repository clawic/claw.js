import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadQuotesConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "quotes",
    defaultPort: 4775,
    hasSessions: false,
    envPrefix: "QUOTES",
    overrides,
  });
}
