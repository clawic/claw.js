import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadCommStatsConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "comm-stats",
    defaultPort: 4744,
    hasSessions: false,
    envPrefix: "COMM_STATS",
    overrides,
  });
}
