import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadWritingConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "writing",
    defaultPort: 4726,
    hasSessions: false,
    envPrefix: "WRITING",
    overrides,
  });
}
