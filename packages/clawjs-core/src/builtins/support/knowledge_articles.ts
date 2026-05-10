import type { BuiltinCollectionDefinition } from "../_types.ts";

export const KNOWLEDGE_ARTICLES: BuiltinCollectionDefinition = {
  name: "knowledge_articles",
  displayName: "Knowledge Articles",
  family: "support",
  aliases: ["article","articles","knowledge_article","knowledge_articles"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "helpCenterId", type: "relation", required: true, relation: { collectionName: "help_centers" } },
    { name: "title", type: "text", required: true },
    { name: "slug", type: "text", required: true },
    { name: "body", type: "text" },
    { name: "bodyHtml", type: "text" },
    { name: "status", type: "select", options: ["draft","published","archived"] },
    { name: "authorActorId", type: "relation", relation: { collectionName: "actors" } },
    { name: "category", type: "text" },
    { name: "tags", type: "json" },
    { name: "views", type: "number" },
    { name: "helpfulVotes", type: "number" },
    { name: "unhelpfulVotes", type: "number" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "kb_articles_help_center_idx", fields: ["helpCenterId"] },
    { name: "kb_articles_slug_unique", fields: ["helpCenterId","slug"], unique: true },
    { name: "kb_articles_status_idx", fields: ["status"] },
  ],
};
