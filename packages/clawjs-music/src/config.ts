import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadMusicConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "music",
    defaultPort: 4731,
    hasSessions: false,
    envPrefix: "MUSIC",
    overrides,
  });
}
