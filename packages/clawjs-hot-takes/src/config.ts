import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadHotTakesConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "hot-takes",
    defaultPort: 4770,
    hasSessions: false,
    envPrefix: "HOT_TAKES",
    overrides,
  });
}
