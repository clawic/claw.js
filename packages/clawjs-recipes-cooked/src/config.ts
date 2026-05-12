import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadRecipesCookedConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "recipes-cooked",
    defaultPort: 4728,
    hasSessions: true,
    envPrefix: "RECIPES_COOKED",
    overrides,
  });
}
