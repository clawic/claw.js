import type { BuiltinCollectionDefinition } from "../_types.ts";

export const SOBRIETY_TRACKERS: BuiltinCollectionDefinition = {
  name: "sobriety_trackers",
  displayName: "Sobriety Trackers",
  family: "mental_health_recovery",
  aliases: ["sobriety_tracker","sobriety_trackers"],
  fields: [
    { name: "substance", type: "select", options: ["alcohol","nicotine","cannabis","cocaine","opioid","gambling","porn","sugar","social_media","caffeine","other"] },
    { name: "startedAt", type: "date", required: true },
    { name: "currentStreakDays", type: "number" },
    { name: "longestStreakDays", type: "number" },
    { name: "slipsCount", type: "number" },
    { name: "active", type: "boolean" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "sobriety_trackers_substance_idx", fields: ["substance"] },
    { name: "sobriety_trackers_active_idx", fields: ["active"] },
  ],
};
