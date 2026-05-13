import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadDreamsConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "dreams",
    defaultPort: 4716,
    hasSessions: false,
    envPrefix: "DREAMS",
    overrides,
  });
}
