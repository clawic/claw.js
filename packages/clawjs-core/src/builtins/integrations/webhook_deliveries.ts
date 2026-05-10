import type { BuiltinCollectionDefinition } from "../_types.ts";

export const WEBHOOK_DELIVERIES: BuiltinCollectionDefinition = {
  name: "webhook_deliveries",
  displayName: "Webhook Deliveries",
  family: "integrations",
  aliases: ["delivery","deliveries","webhook_delivery","webhook_deliveries"],
  fields: [
    { name: "webhookId", type: "relation", required: true, relation: { collectionName: "webhooks_outbound" } },
    { name: "eventType", type: "text", required: true },
    { name: "payload", type: "json" },
    { name: "responseStatus", type: "number" },
    { name: "responseBody", type: "text" },
    { name: "attemptCount", type: "number" },
    { name: "nextRetryAt", type: "date" },
    { name: "succeededAt", type: "date" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "webhook_deliv_webhook_idx", fields: ["webhookId"] },
    { name: "webhook_deliv_retry_idx", fields: ["nextRetryAt"] },
  ],
};
