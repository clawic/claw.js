import type { BuiltinCollectionDefinition } from "../_types.ts";

export const MEMORIES: BuiltinCollectionDefinition = {
  name: "memories",
  displayName: "Memories",
  family: "events_memories",
  aliases: ["memory","memories"],
  fields: [
    { name: "title", type: "text", required: true },
    { name: "happenedAt", type: "date" },
    { name: "description", type: "text" },
    { name: "tags", type: "json" },
    { name: "images", type: "json" },
    { name: "favorited", type: "boolean" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "memories_happened_idx", fields: ["happenedAt"] },
  ],
};
