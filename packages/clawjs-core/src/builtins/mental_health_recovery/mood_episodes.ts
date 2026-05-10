import type { BuiltinCollectionDefinition } from "../_types.ts";

export const MOOD_EPISODES: BuiltinCollectionDefinition = {
  name: "mood_episodes",
  displayName: "Mood Episodes",
  family: "mental_health_recovery",
  aliases: ["mood_episode","mood_episodes"],
  fields: [
    { name: "kind", type: "select", options: ["depression","mania","hypomania","mixed","euthymia","anxiety"] },
    { name: "startedAt", type: "date", required: true },
    { name: "endedAt", type: "date" },
    { name: "severity", type: "rating", enumScale: 10 },
    { name: "notesBody", type: "markdown" },
  ],
  indexes: [
    { name: "mood_episodes_kind_idx", fields: ["kind"] },
  ],
  rules: [
    {"kind":"compare_dates","left":"startedAt","op":"<=","right":"endedAt"},
  ],
};
