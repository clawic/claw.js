import type { BuiltinCollectionDefinition } from "../_types.ts";

export const TV_EPISODES: BuiltinCollectionDefinition = {
  name: "tv_episodes",
  displayName: "TV Episodes",
  family: "reading_media",
  aliases: ["tv_episode","tv_episodes"],
  fields: [
    { name: "tvShowId", type: "relation", required: true, relation: { collectionName: "tv_shows" } },
    { name: "season", type: "number" },
    { name: "episode", type: "number" },
    { name: "title", type: "text", required: true },
    { name: "airedAt", type: "date" },
    { name: "runtimeMinutes", type: "number" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "tv_episodes_show_idx", fields: ["tvShowId"] },
  ],
};
