import type { BuiltinCollectionDefinition } from "../_types.ts";

export const ARTICLES: BuiltinCollectionDefinition = {
  name: "articles",
  displayName: "Articles",
  family: "reading_media",
  aliases: ["article","articles"],
  fields: [
    { name: "title", type: "text", required: true },
    { name: "author", type: "text" },
    { name: "publication", type: "text" },
    { name: "url", type: "url" },
    { name: "status", type: "select", options: ["to_read","reading","read","archived"] },
    { name: "tags", type: "json" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "articles_status_idx", fields: ["status"] },
  ],
};
