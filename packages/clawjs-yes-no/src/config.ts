import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadYesNoConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "yes-no",
    defaultPort: 4772,
    hasSessions: false,
    envPrefix: "YES_NO",
    overrides,
  });
}
