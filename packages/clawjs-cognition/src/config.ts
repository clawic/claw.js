import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadCognitionConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "cognition",
    defaultPort: 4761,
    hasSessions: false,
    envPrefix: "COGNITION",
    overrides,
  });
}
