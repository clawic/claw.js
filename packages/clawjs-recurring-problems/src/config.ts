import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadRecurringProblemsConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "recurring-problems",
    defaultPort: 4719,
    hasSessions: false,
    envPrefix: "RECURRING_PROBLEMS",
    overrides,
  });
}
