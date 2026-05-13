import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadGamesConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "games",
    defaultPort: 4732,
    hasSessions: true,
    envPrefix: "GAMES",
    overrides,
  });
}
