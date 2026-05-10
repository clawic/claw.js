import type { BuiltinCollectionDefinition } from "../_types.ts";

export const NEWSLETTER_POSTS: BuiltinCollectionDefinition = {
  name: "newsletter_posts",
  displayName: "Newsletter Posts",
  family: "marketing",
  aliases: ["newsletter_post","newsletter_posts"],
  fields: [
    { name: "newsletterId", type: "relation", required: true, relation: { collectionName: "newsletters" } },
    { name: "title", type: "text", required: true },
    { name: "slug", type: "text", required: true },
    { name: "body", type: "text" },
    { name: "bodyHtml", type: "text" },
    { name: "publishedAt", type: "date" },
    { name: "audienceSegmentId", type: "relation", relation: { collectionName: "segments" } },
    { name: "sentCount", type: "number" },
    { name: "openRate", type: "number" },
    { name: "clickRate", type: "number" },
    { name: "unsubscribeCount", type: "number" },
    { name: "isPaid", type: "boolean" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "posts_newsletter_slug_unique", fields: ["newsletterId","slug"], unique: true },
    { name: "posts_published_idx", fields: ["publishedAt"] },
  ],
};
