import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadLearningConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "learning",
    defaultPort: 4777,
    hasSessions: true,
    envPrefix: "LEARNING",
    overrides,
  });
}
