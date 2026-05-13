import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadVehicleConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "vehicle",
    defaultPort: 4757,
    hasSessions: false,
    envPrefix: "VEHICLE",
    overrides,
  });
}
