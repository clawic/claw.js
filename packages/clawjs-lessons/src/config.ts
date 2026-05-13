import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadLessonsConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "lessons",
    defaultPort: 4765,
    hasSessions: false,
    envPrefix: "LESSONS",
    overrides,
  });
}
