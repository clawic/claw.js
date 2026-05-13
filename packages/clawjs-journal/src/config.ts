import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadJournalConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "journal",
    defaultPort: 4715,
    hasSessions: true,
    envPrefix: "JOURNAL",
    overrides,
  });
}
