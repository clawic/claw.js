import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadSexConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "sex",
    defaultPort: 4711,
    hasSessions: false,
    envPrefix: "SEX",
    overrides,
  });
}
