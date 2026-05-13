import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadBeliefsConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "beliefs",
    defaultPort: 4768,
    hasSessions: false,
    envPrefix: "BELIEFS",
    overrides,
  });
}
