import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadPetsConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "pets",
    defaultPort: 4754,
    hasSessions: false,
    envPrefix: "PETS",
    overrides,
  });
}
