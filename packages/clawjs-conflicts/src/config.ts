import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadConflictsConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "conflicts",
    defaultPort: 4738,
    hasSessions: false,
    envPrefix: "CONFLICTS",
    overrides,
  });
}
