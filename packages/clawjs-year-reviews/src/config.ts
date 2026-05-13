import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadYearReviewsConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "year-reviews",
    defaultPort: 4778,
    hasSessions: true,
    envPrefix: "YEAR_REVIEWS",
    overrides,
  });
}
