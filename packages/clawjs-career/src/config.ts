import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadCareerConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "career",
    defaultPort: 4758,
    hasSessions: false,
    envPrefix: "CAREER",
    overrides,
  });
}
