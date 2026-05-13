import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadIdentityValuesConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "identity-values",
    defaultPort: 4767,
    hasSessions: false,
    envPrefix: "IDENTITY_VALUES",
    overrides,
  });
}
