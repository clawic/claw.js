import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadComplimentsConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "compliments",
    defaultPort: 4779,
    hasSessions: false,
    envPrefix: "COMPLIMENTS",
    overrides,
  });
}
