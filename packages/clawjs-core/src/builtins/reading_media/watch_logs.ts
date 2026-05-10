import type { BuiltinCollectionDefinition } from "../_types.ts";

export const WATCH_LOGS: BuiltinCollectionDefinition = {
  name: "watch_logs",
  displayName: "Watch Logs",
  family: "reading_media",
  aliases: ["watch_log","watch_logs"],
  fields: [
    { name: "watchlistItemId", type: "relation", relation: { collectionName: "watchlist_items" } },
    { name: "movieId", type: "relation", relation: { collectionName: "movies" } },
    { name: "episodeId", type: "relation", relation: { collectionName: "tv_episodes" } },
    { name: "watchedAt", type: "date", required: true },
    { name: "rating", type: "number" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "watch_logs_watched_idx", fields: ["watchedAt"] },
  ],
};
