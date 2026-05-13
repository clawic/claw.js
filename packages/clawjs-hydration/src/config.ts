import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadHydrationConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "hydration",
    defaultPort: 4704,
    hasSessions: false,
    envPrefix: "HYDRATION",
    overrides,
  });
}
