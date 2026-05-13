import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadOutfitsConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "outfits",
    defaultPort: 4750,
    hasSessions: false,
    envPrefix: "OUTFITS",
    overrides,
  });
}
