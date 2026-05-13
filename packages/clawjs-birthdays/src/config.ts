import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadBirthdaysConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "birthdays",
    defaultPort: 4737,
    hasSessions: false,
    envPrefix: "BIRTHDAYS",
    overrides,
  });
}
