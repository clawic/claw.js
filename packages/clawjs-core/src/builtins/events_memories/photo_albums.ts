import type { BuiltinCollectionDefinition } from "../_types.ts";

export const PHOTO_ALBUMS: BuiltinCollectionDefinition = {
  name: "photo_albums",
  displayName: "Photo Albums",
  family: "events_memories",
  aliases: ["photo_album","photo_albums","album"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "description", type: "text" },
    { name: "startsAt", type: "date" },
    { name: "endsAt", type: "date" },
    { name: "image", type: "file" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "photo_albums_name_idx", fields: ["name"] },
  ],
};
