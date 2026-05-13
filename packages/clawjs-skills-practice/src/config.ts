import { loadSignalsServiceConfig, type SignalsServiceConfig } from "@clawjs/signals";

export function loadSkillsPracticeConfig(overrides: Partial<SignalsServiceConfig> = {}) {
  return loadSignalsServiceConfig({
    domain: "skills-practice",
    defaultPort: 4729,
    hasSessions: true,
    envPrefix: "SKILLS_PRACTICE",
    overrides,
  });
}
