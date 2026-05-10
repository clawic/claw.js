import type { BuiltinCollectionDefinition } from "../_types.ts";

export const VOICE_MEMOS: BuiltinCollectionDefinition = {
  name: "voice_memos",
  displayName: "Voice Memos",
  family: "bookmarks_misc",
  aliases: ["voice_memo","voice_memos"],
  fields: [
    { name: "title", type: "text", required: true },
    { name: "audio", type: "file" },
    { name: "durationSeconds", type: "number" },
    { name: "recordedAt", type: "date" },
    { name: "transcription", type: "text" },
    { name: "tags", type: "json" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "voice_memos_recorded_idx", fields: ["recordedAt"] },
  ],
};
