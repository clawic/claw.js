import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadAchievementsConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "achievements",
    defaultPort: 4764,
    hasSessions: false,
    envPrefix: "ACHIEVEMENTS",
    overrides,
  });
}
