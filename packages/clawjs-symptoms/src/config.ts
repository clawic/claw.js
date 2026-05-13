import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadSymptomsConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "symptoms",
    defaultPort: 4712,
    hasSessions: false,
    envPrefix: "SYMPTOMS",
    overrides,
  });
}
