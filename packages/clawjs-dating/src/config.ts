import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadDatingConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "dating",
    defaultPort: 4739,
    hasSessions: true,
    envPrefix: "DATING",
    overrides,
  });
}
