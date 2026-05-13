import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadEventsAttendedConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "events-attended",
    defaultPort: 4735,
    hasSessions: true,
    envPrefix: "EVENTS_ATTENDED",
    overrides,
  });
}
