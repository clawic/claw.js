import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadMemorableMomentsConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "memorable-moments",
    defaultPort: 4718,
    hasSessions: false,
    envPrefix: "MEMORABLE_MOMENTS",
    overrides,
  });
}
