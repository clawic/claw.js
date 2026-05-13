import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadBeautyConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "beauty",
    defaultPort: 4709,
    hasSessions: false,
    envPrefix: "BEAUTY",
    overrides,
  });
}
