import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadMentorshipConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "mentorship",
    defaultPort: 4741,
    hasSessions: true,
    envPrefix: "MENTORSHIP",
    overrides,
  });
}
