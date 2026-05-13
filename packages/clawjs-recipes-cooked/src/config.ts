import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadRecipesCookedConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "recipes-cooked",
    defaultPort: 4728,
    hasSessions: true,
    envPrefix: "RECIPES_COOKED",
    overrides,
  });
}
