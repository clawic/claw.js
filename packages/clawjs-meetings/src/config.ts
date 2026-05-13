import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadMeetingsConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "meetings",
    defaultPort: 4725,
    hasSessions: true,
    envPrefix: "MEETINGS",
    overrides,
  });
}
