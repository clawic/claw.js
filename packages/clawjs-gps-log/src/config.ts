import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadGpsLogConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "gps-log",
    defaultPort: 4746,
    hasSessions: false,
    envPrefix: "GPS_LOG",
    overrides,
  });
}
