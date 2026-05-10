import type { BuiltinCollectionDefinition } from "../_types.ts";

export const CAMPAIGN_MEMBERS: BuiltinCollectionDefinition = {
  name: "campaign_members",
  displayName: "Campaign Members",
  family: "crm",
  aliases: ["campaign_member","campaign_members"],
  fields: [
    { name: "campaignId", type: "relation", required: true, relation: { collectionName: "campaigns" } },
    { name: "contactId", type: "relation", relation: { collectionName: "contacts" } },
    { name: "leadId", type: "relation", relation: { collectionName: "leads" } },
    { name: "status", type: "select", options: ["added","responded","converted","removed"] },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "campaign_members_campaign_idx", fields: ["campaignId"] },
  ],
};
