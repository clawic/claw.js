import type { BuiltinCollectionDefinition } from "../_types.ts";

export const ARTICLE_PROGRESS: BuiltinCollectionDefinition = {
  name: "article_progress",
  displayName: "Article Progress",
  family: "reading_media",
  aliases: ["article_progress"],
  fields: [
    { name: "articleId", type: "relation", required: true, relation: { collectionName: "articles" } },
    { name: "loggedAt", type: "date", required: true },
    { name: "percent", type: "number" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "article_progress_article_idx", fields: ["articleId"] },
  ],
};
