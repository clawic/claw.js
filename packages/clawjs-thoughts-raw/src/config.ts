import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadThoughtsRawConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "thoughts-raw",
    defaultPort: 4717,
    hasSessions: false,
    envPrefix: "THOUGHTS_RAW",
    overrides,
  });
}
