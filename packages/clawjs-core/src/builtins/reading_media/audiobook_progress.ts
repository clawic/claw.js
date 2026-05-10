import type { BuiltinCollectionDefinition } from "../_types.ts";

export const AUDIOBOOK_PROGRESS: BuiltinCollectionDefinition = {
  name: "audiobook_progress",
  displayName: "Audiobook Progress",
  family: "reading_media",
  aliases: ["audiobook_progress"],
  fields: [
    { name: "audiobookId", type: "relation", required: true, relation: { collectionName: "audiobooks" } },
    { name: "loggedAt", type: "date", required: true },
    { name: "percent", type: "number" },
    { name: "durationMinutes", type: "number" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "audiobook_progress_audiobook_idx", fields: ["audiobookId"] },
  ],
};
