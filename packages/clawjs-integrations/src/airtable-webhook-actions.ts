import {
  BASE,
  spec,
  WEBHOOK,
  webhookBodyFields,
  type AirtableOperationSpec,
} from "./airtable-operation-core.ts";

export const AIRTABLE_WEBHOOK_ACTION_SPECS = [
  spec("list-webhooks", "GET", "v0/bases/{baseId}/webhooks", BASE, {
    requiredPaths: ["webhooks"],
  }),
  spec("create-webhook", "POST", "v0/bases/{baseId}/webhooks", [...BASE, ...webhookBodyFields()], {
    body: ["notificationUrl", "specification"],
    requiredPaths: ["id", "macSecretBase64", "expirationTime"],
  }),
  spec("get-webhook-payloads", "GET", "v0/bases/{baseId}/webhooks/{webhookId}/payloads", [
    ...WEBHOOK,
    { name: "cursor", type: "integer", optional: true, default: 1, min: 1 },
    { name: "limit", type: "integer", optional: true, default: 50, min: 1, max: 50 },
  ], {
    query: ["cursor", "limit"],
    requiredPaths: ["payloads"],
  }),
  spec("refresh-webhook", "POST", "v0/bases/{baseId}/webhooks/{webhookId}/refresh", WEBHOOK, {
    requiredPaths: ["expirationTime"],
  }),
  spec("delete-webhook", "DELETE", "v0/bases/{baseId}/webhooks/{webhookId}", WEBHOOK),
] as const satisfies readonly AirtableOperationSpec[];
