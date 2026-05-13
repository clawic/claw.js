import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadGiftsConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "gifts",
    defaultPort: 4752,
    hasSessions: false,
    envPrefix: "GIFTS",
    overrides,
  });
}
