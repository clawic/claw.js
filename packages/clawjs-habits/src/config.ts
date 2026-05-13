import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadHabitsConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "habits",
    defaultPort: 4723,
    hasSessions: false,
    envPrefix: "HABITS",
    overrides,
  });
}
