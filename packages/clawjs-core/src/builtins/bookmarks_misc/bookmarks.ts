import type { BuiltinCollectionDefinition } from "../_types.ts";

export const BOOKMARKS: BuiltinCollectionDefinition = {
  name: "bookmarks",
  displayName: "Bookmarks",
  family: "bookmarks_misc",
  aliases: ["bookmark","bookmarks"],
  fields: [
    { name: "title", type: "text", required: true },
    { name: "url", type: "url", required: true },
    { name: "description", type: "text" },
    { name: "collectionId", type: "relation", relation: { collectionName: "bookmark_collections" } },
    { name: "tags", type: "json" },
    { name: "favorited", type: "boolean" },
    { name: "archived", type: "boolean" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "bookmarks_title_idx", fields: ["title"] },
    { name: "bookmarks_collection_idx", fields: ["collectionId"] },
  ],
};
