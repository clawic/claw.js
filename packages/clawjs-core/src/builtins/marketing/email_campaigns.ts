import type { BuiltinCollectionDefinition } from "../_types.ts";

export const EMAIL_CAMPAIGNS: BuiltinCollectionDefinition = {
  name: "email_campaigns",
  displayName: "Email Campaigns",
  family: "marketing",
  aliases: ["email_campaign","email_campaigns","broadcast","broadcasts"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "newsletterId", type: "relation", relation: { collectionName: "newsletters" } },
    { name: "name", type: "text", required: true },
    { name: "subject", type: "text" },
    { name: "body", type: "text" },
    { name: "audienceSegmentId", type: "relation", relation: { collectionName: "segments" } },
    { name: "scheduledAt", type: "date" },
    { name: "sentAt", type: "date" },
    { name: "recipientCount", type: "number" },
    { name: "metrics", type: "json" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "campaigns_email_company_idx", fields: ["companyId"] },
  ],
};
