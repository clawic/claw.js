import type { BuiltinCollectionDefinition } from "../_types.ts";

export const PODCAST_EPISODES: BuiltinCollectionDefinition = {
  name: "podcast_episodes",
  displayName: "Podcast Episodes",
  family: "reading_media",
  aliases: ["podcast_episode","podcast_episodes"],
  fields: [
    { name: "podcastId", type: "relation", required: true, relation: { collectionName: "podcasts" } },
    { name: "title", type: "text", required: true },
    { name: "publishedAt", type: "date" },
    { name: "durationMinutes", type: "number" },
    { name: "audioUrl", type: "url" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "podcast_episodes_podcast_idx", fields: ["podcastId"] },
  ],
};
