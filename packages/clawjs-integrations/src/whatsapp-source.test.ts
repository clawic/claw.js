import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeConnectorCatalog } from "./catalog.ts";
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
      },
      {
        id: "whatsapp.source.message-status",
        appId: "whatsapp",
        kind: "source",
        name: "Message Status",
        fields: [],
        authFieldNames: [],
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
});

function operation(operationId: string) {
  const found = WHATSAPP_SOURCE_CATALOG.apps[0]?.operations.find((candidate) => candidate.id === operationId);
  assert.ok(found);
  return found;
}
