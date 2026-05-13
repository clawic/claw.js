import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadStretchingConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "stretching",
    defaultPort: 4707,
    hasSessions: false,
    envPrefix: "STRETCHING",
    overrides,
  });
}
