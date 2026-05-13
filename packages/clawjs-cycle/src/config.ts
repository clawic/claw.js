import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadCycleConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "cycle",
    defaultPort: 4710,
    hasSessions: false,
    envPrefix: "CYCLE",
    overrides,
  });
}
