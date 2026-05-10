import type { BuiltinCollectionDefinition } from "../_types.ts";

export const MUSIC_TRACKS: BuiltinCollectionDefinition = {
  name: "music_tracks",
  displayName: "Music Tracks",
  family: "creativity",
  aliases: ["music_track","music_tracks"],
  fields: [
    { name: "title", type: "text", required: true },
    { name: "artist", type: "text" },
    { name: "status", type: "select", options: ["draft","demo","recorded","released","shelved"] },
    { name: "durationSeconds", type: "number" },
    { name: "genre", type: "text" },
    { name: "audio", type: "file" },
    { name: "lyrics", type: "text" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "music_tracks_status_idx", fields: ["status"] },
  ],
};
