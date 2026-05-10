import type { BuiltinCollectionDefinition } from "../_types.ts";

export const PODCAST_PROGRESS: BuiltinCollectionDefinition = {
  name: "podcast_progress",
  displayName: "Podcast Progress",
  family: "reading_media",
  aliases: ["podcast_progress"],
  fields: [
    { name: "episodeId", type: "relation", required: true, relation: { collectionName: "podcast_episodes" } },
    { name: "loggedAt", type: "date", required: true },
    { name: "percent", type: "number" },
    { name: "completed", type: "boolean" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "podcast_progress_episode_idx", fields: ["episodeId"] },
  ],
};
