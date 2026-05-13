import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadBookmarksConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "bookmarks",
    defaultPort: 4733,
    hasSessions: false,
    envPrefix: "BOOKMARKS",
    overrides,
  });
}
