import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadWildlifeConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "wildlife",
    defaultPort: 4748,
    hasSessions: false,
    envPrefix: "WILDLIFE",
    overrides,
  });
}
