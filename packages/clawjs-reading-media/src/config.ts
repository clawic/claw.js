import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadReadingMediaConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "reading-media",
    defaultPort: 4730,
    hasSessions: false,
    envPrefix: "READING_MEDIA",
    overrides,
  });
}
