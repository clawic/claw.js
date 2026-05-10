import type { BuiltinCollectionDefinition } from "../_types.ts";

export const BOOKMARK_COLLECTIONS: BuiltinCollectionDefinition = {
  name: "bookmark_collections",
  displayName: "Bookmark Collections",
  family: "bookmarks_misc",
  aliases: ["bookmark_collection","bookmark_collections"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "description", type: "text" },
    { name: "color", type: "text" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "bookmark_collections_name_idx", fields: ["name"] },
  ],
};
