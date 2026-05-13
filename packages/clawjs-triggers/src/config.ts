import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadTriggersConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "triggers",
    defaultPort: 4720,
    hasSessions: false,
    envPrefix: "TRIGGERS",
    overrides,
  });
}
