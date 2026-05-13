import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadPhotographyConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "photography",
    defaultPort: 4727,
    hasSessions: false,
    envPrefix: "PHOTOGRAPHY",
    overrides,
  });
}
