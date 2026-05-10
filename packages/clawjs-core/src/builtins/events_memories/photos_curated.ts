import type { BuiltinCollectionDefinition } from "../_types.ts";

export const PHOTOS_CURATED: BuiltinCollectionDefinition = {
  name: "photos_curated",
  displayName: "Curated Photos",
  family: "events_memories",
  aliases: ["photo_curated","photos_curated"],
  fields: [
    { name: "title", type: "text", required: true },
    { name: "image", type: "file" },
    { name: "takenAt", type: "date" },
    { name: "location", type: "text" },
    { name: "albumId", type: "relation", relation: { collectionName: "photo_albums" } },
    { name: "tags", type: "json" },
    { name: "favorited", type: "boolean" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "photos_curated_taken_idx", fields: ["takenAt"] },
  ],
};
