import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadRelationshipsConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "relationships",
    defaultPort: 4736,
    hasSessions: false,
    envPrefix: "RELATIONSHIPS",
    overrides,
  });
}
