import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadVolunteeringConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "volunteering",
    defaultPort: 4743,
    hasSessions: true,
    envPrefix: "VOLUNTEERING",
    overrides,
  });
}
