import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadWeatherConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "weather",
    defaultPort: 4747,
    hasSessions: false,
    envPrefix: "WEATHER",
    overrides,
  });
}
