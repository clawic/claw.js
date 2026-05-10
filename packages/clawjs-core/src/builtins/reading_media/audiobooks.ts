import type { BuiltinCollectionDefinition } from "../_types.ts";

export const AUDIOBOOKS: BuiltinCollectionDefinition = {
  name: "audiobooks",
  displayName: "Audiobooks",
  family: "reading_media",
  aliases: ["audiobook","audiobooks"],
  fields: [
    { name: "title", type: "text", required: true },
    { name: "author", type: "text" },
    { name: "narrator", type: "text" },
    { name: "durationMinutes", type: "number" },
    { name: "status", type: "select", options: ["want_to_listen","listening","listened","abandoned"] },
    { name: "rating", type: "number" },
    { name: "tags", type: "json" },
    { name: "image", type: "file" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "audiobooks_status_idx", fields: ["status"] },
  ],
};
