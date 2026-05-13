import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadWishlistConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "wishlist",
    defaultPort: 4763,
    hasSessions: false,
    envPrefix: "WISHLIST",
    overrides,
  });
}
