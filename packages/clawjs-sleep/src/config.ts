import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadSleepConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "sleep",
    defaultPort: 4701,
    hasSessions: true,
    envPrefix: "SLEEP",
    overrides,
  });
}
