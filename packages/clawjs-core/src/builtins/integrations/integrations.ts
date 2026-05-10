import type { BuiltinCollectionDefinition } from "../_types.ts";

export const INTEGRATIONS: BuiltinCollectionDefinition = {
  name: "integrations",
  displayName: "Integrations",
  family: "integrations",
  aliases: ["integration","integrations"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "teamId", type: "relation", relation: { collectionName: "teams" } },
    { name: "type", type: "select", required: true, options: ["slack","github","gitlab","bitbucket","jira","asana","linear","monday","clickup","notion","zendesk","intercom","front","figma","sentry","datadog","pagerduty","google_workspace","microsoft_teams","discord","telegram","calendly","stripe","hubspot","salesforce","pipedrive","twilio","sendgrid","mailchimp","custom"] },
    { name: "enabled", type: "boolean" },
    { name: "settings", type: "json" },
    { name: "authTokenEncrypted", type: "text" },
    { name: "webhookUrl", type: "text" },
    { name: "lastSyncAt", type: "date" },
    { name: "reconnectRequired", type: "boolean" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "integrations_company_idx", fields: ["companyId"] },
    { name: "integrations_type_idx", fields: ["type"] },
  ],
};
