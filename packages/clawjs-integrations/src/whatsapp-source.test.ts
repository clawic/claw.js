import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeConnectorCatalog } from "./catalog.ts";
import {
  buildConnectorOperationRuntimePlan,
  verifyConnectorRuntimeCoverage,
  verifyConnectorRuntimeOfflineExecutions,
} from "./runtime-coverage.ts";
import {
  handleConnectorRuntimeWebhook,
} from "./runtime-webhook.ts";
import {
  buildWhatsAppSourcePlan,
} from "./whatsapp-source.ts";

const WHATSAPP_SOURCE_CATALOG = normalizeConnectorCatalog({
  version: 1,
  apps: [{
    id: "whatsapp",
    name: "WhatsApp",
    authFieldNames: [],
    fields: [],
    operations: [
      {
        id: "whatsapp.source.new-message",
        appId: "whatsapp",
        kind: "source",
        name: "New Message",
        fields: [],
        authFieldNames: [],
        runtime: {
          hasRun: false,
          hasHooks: false,
          hasAdditionalProps: false,
          hasMethods: false,
          dedupe: "id",
        },
        source: {
          delivery: "webhook",
          usesTimer: false,
          usesHttp: true,
          usesServiceDb: false,
        },
      },
      {
        id: "whatsapp.source.message-status",
        appId: "whatsapp",
        kind: "source",
        name: "Message Status",
        fields: [],
        authFieldNames: [],
        runtime: {
          hasRun: false,
          hasHooks: false,
          hasAdditionalProps: false,
          hasMethods: false,
          dedupe: "id",
        },
        source: {
          delivery: "webhook",
          usesTimer: false,
          usesHttp: true,
          usesServiceDb: false,
        },
      },
    ],
  }],
});

describe("whatsapp webhook sources", () => {
  it("builds webhook source plans for WhatsApp message payloads", () => {
    assert.deepEqual(buildWhatsAppSourcePlan(operation("whatsapp.source.new-message")), {
      delivery: "webhook",
      dedupe: "id",
      hooks: [],
      eventsPath: "entry.changes.value.messages",
    });
    assert.deepEqual(buildWhatsAppSourcePlan(operation("whatsapp.source.message-status")), {
      delivery: "webhook",
      dedupe: "id",
      hooks: [],
      eventsPath: "entry.changes.value.statuses",
    });
  });

  it("exposes registered webhook source plans", () => {
    assert.deepEqual(buildConnectorOperationRuntimePlan(operation("whatsapp.source.new-message")).sourcePlan, {
      delivery: "webhook",
      dedupe: "id",
      hooks: [],
      eventsPath: "entry.changes.value.messages",
    });
    assert.deepEqual(buildConnectorOperationRuntimePlan(operation("whatsapp.source.message-status")).sourcePlan, {
      delivery: "webhook",
      dedupe: "id",
      hooks: [],
      eventsPath: "entry.changes.value.statuses",
    });
  });

  it("extracts nested webhook message and status events", () => {
    const messageResult = handleConnectorRuntimeWebhook({
      operation: operation("whatsapp.source.new-message"),
      payload: {
        entry: [{
          changes: [{
            value: {
              messages: [{ id: "wamid.message", type: "text" }],
            },
          }],
        }],
      },
    });
    assert.deepEqual(messageResult.events, [{ id: "wamid.message", type: "text" }]);

    const statusResult = handleConnectorRuntimeWebhook({
      operation: operation("whatsapp.source.message-status"),
      payload: {
        entry: [{
          changes: [{
            value: {
              statuses: [{ id: "wamid.message", status: "delivered" }],
            },
          }],
        }],
      },
    });
    assert.deepEqual(statusResult.events, [{ id: "wamid.message", status: "delivered" }]);
  });

  it("covers WhatsApp webhook sources with operation-scoped offline fixtures", async () => {
    const coverage = verifyConnectorRuntimeCoverage(WHATSAPP_SOURCE_CATALOG);
    assert.equal(coverage.summary.missing, 0);
    assert.equal(coverage.summary.implemented, 2);

    const offline = await verifyConnectorRuntimeOfflineExecutions(WHATSAPP_SOURCE_CATALOG);
    assert.deepEqual(offline.results.map((result) => result.operationId).sort(), [
      "whatsapp.source.message-status",
      "whatsapp.source.new-message",
    ]);
  });
});

function operation(operationId: string) {
  const found = WHATSAPP_SOURCE_CATALOG.apps[0]?.operations.find((candidate) => candidate.id === operationId);
  assert.ok(found);
  return found;
}
