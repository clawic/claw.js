import type { BuiltinCollectionDefinition } from "../_types.ts";

export const NEWSLETTER_SUBSCRIBERS: BuiltinCollectionDefinition = {
  name: "newsletter_subscribers",
  displayName: "Newsletter Subscribers",
  family: "marketing",
  aliases: ["subscriber","subscribers","newsletter_subscriber","newsletter_subscribers"],
  fields: [
    { name: "newsletterId", type: "relation", required: true, relation: { collectionName: "newsletters" } },
    { name: "email", type: "email", required: true },
    { name: "status", type: "select", options: ["subscribed","unsubscribed","pending","cleaned","bounced"] },
    { name: "tier", type: "select", options: ["free","paid","premium","founding"] },
    { name: "subscribedAt", type: "date" },
    { name: "unsubscribedAt", type: "date" },
    { name: "customFields", type: "json" },
    { name: "referralCode", type: "text" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "subs_newsletter_email_unique", fields: ["newsletterId","email"], unique: true },
    { name: "subs_status_idx", fields: ["status"] },
  ],
};
