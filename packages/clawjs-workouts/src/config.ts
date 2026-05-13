import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadWorkoutsConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "workouts",
    defaultPort: 4713,
    hasSessions: true,
    envPrefix: "WORKOUTS",
    overrides,
  });
}
