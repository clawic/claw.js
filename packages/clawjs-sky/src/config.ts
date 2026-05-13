import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadSkyConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "sky",
    defaultPort: 4749,
    hasSessions: false,
    envPrefix: "SKY",
    overrides,
  });
}
