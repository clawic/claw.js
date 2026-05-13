import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadDonationsConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "donations",
    defaultPort: 4742,
    hasSessions: false,
    envPrefix: "DONATIONS",
    overrides,
  });
}
