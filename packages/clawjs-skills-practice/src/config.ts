import { loadTrackingServiceConfig, type TrackingServiceConfig } from "@clawjs/tracking-runtime";

export function loadSkillsPracticeConfig(overrides: Partial<TrackingServiceConfig> = {}) {
  return loadTrackingServiceConfig({
    domain: "skills-practice",
    defaultPort: 4729,
    hasSessions: true,
    envPrefix: "SKILLS_PRACTICE",
    overrides,
  });
}
