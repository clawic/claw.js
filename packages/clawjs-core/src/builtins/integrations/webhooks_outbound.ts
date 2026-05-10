import type { BuiltinCollectionDefinition } from "../_types.ts";

export const WEBHOOKS_OUTBOUND: BuiltinCollectionDefinition = {
  name: "webhooks_outbound",
  displayName: "Outbound Webhooks",
  family: "integrations",
  aliases: ["webhook","webhooks","webhooks_outbound","outbound_webhook"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "teamId", type: "relation", relation: { collectionName: "teams" } },
    { name: "url", type: "text", required: true },
    { name: "secret", type: "text" },
    { name: "allEvents", type: "boolean" },
    { name: "resourceTypes", type: "json" },
    { name: "events", type: "json" },
    { name: "enabled", type: "boolean" },
    { name: "lastTriggeredAt", type: "date" },
    { name: "failureCount", type: "number" },
    { name: "label", type: "text" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "webhooks_company_idx", fields: ["companyId"] },
  ],
};
