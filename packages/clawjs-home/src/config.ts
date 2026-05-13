import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadHomeConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "home",
    defaultPort: 4755,
    hasSessions: false,
    envPrefix: "HOME",
    overrides,
  });
}
