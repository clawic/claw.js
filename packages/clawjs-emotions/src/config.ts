import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadEmotionsConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "emotions",
    defaultPort: 4714,
    hasSessions: false,
    envPrefix: "EMOTIONS",
    overrides,
  });
}
