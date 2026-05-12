import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeConnectorCatalog } from "./catalog.ts";
import {
  buildWhatsAppOperationRequest,
} from "./whatsapp-operation-executor.ts";

const WHATSAPP_CATALOG = normalizeConnectorCatalog({
  version: 1,
  apps: [{
    id: "whatsapp",
    name: "WhatsApp",
    authFieldNames: ["whatsAppAccessToken"],
    fields: [{
      name: "whatsAppAccessToken",
      type: "app",
      optional: false,
      secret: true,
    }],
    operations: [
      {
        id: "whatsapp.action.verify-phone-number",
        appId: "whatsapp",
        kind: "action",
        name: "Verify Phone Number",
        fields: [
          { name: "phoneNumberId", type: "string", optional: false },
        ],
        authFieldNames: ["whatsAppAccessToken"],
      },
      {
        id: "whatsapp.action.send-message",
        appId: "whatsapp",
        kind: "action",
        name: "Send Message",
        fields: [
          { name: "phoneNumberId", type: "string", optional: false },
          { name: "to", type: "string", optional: false },
          { name: "text", type: "string", optional: false },
          { name: "quotedMessageId", type: "string", optional: true },
        ],
        authFieldNames: ["whatsAppAccessToken"],
      },
    ],
  }],
});

describe("whatsapp operation runtime", () => {
  it("builds WhatsApp Cloud API request plans", () => {
    const verify = operation("whatsapp.action.verify-phone-number");
    const send = operation("whatsapp.action.send-message");

    assert.deepEqual(buildWhatsAppOperationRequest(verify, { phoneNumberId: "12345" }), {
      method: "GET",
      endpoint: "12345",
      auth: [{ type: "secret", field: "whatsAppAccessToken", placement: "bearer" }],
      headers: { accept: "application/json" },
      body: {},
      responseSchema: {
        type: "object",
        requiredPaths: ["id"],
      },
    });

    assert.deepEqual(buildWhatsAppOperationRequest(send, {
      phoneNumberId: "12345",
      to: "15551234567",
      text: "hello",
      quotedMessageId: "wamid.sample",
    }), {
      method: "POST",
      endpoint: "12345/messages",
      auth: [{ type: "secret", field: "whatsAppAccessToken", placement: "bearer" }],
      headers: { accept: "application/json" },
      body: {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: "15551234567",
        type: "text",
        text: { body: "hello" },
        context: { message_id: "wamid.sample" },
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["messages"],
      },
    });
  });
});

function operation(operationId: string) {
  const found = WHATSAPP_CATALOG.apps[0]?.operations.find((candidate) => candidate.id === operationId);
  assert.ok(found);
  return found;
}
