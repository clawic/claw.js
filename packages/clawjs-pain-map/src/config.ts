import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadPainMapConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "pain-map",
    defaultPort: 4706,
    hasSessions: false,
    envPrefix: "PAIN_MAP",
    overrides,
  });
}
