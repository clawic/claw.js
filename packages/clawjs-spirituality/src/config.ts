import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadSpiritualityConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "spirituality",
    defaultPort: 4776,
    hasSessions: true,
    envPrefix: "SPIRITUALITY",
    overrides,
  });
}
