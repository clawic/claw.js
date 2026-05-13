import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadPersonalityTestsConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "personality-tests",
    defaultPort: 4769,
    hasSessions: false,
    envPrefix: "PERSONALITY_TESTS",
    overrides,
  });
}
