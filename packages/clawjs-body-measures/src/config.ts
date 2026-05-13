import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadBodyMeasuresConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "body-measures",
    defaultPort: 4705,
    hasSessions: false,
    envPrefix: "BODY_MEASURES",
    overrides,
  });
}
