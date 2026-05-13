import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadScreenTimeConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "screen-time",
    defaultPort: 4708,
    hasSessions: false,
    envPrefix: "SCREEN_TIME",
    overrides,
  });
}
