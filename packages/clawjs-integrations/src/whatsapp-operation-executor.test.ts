import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { normalizeConnectorCatalog } from "./catalog.ts";
import {
  verifyConnectorRuntimeCoverage,
  verifyConnectorRuntimeOfflineExecutions,
} from "./runtime-coverage.ts";
import {
  buildWhatsAppOperationRequest,
  WHATSAPP_ACTION_SLUGS,
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

  it("builds expanded WhatsApp message request plans", () => {
    assert.deepEqual(buildWhatsAppOperationRequest(testOperation("whatsapp.action.send-image-message"), {
      phoneNumberId: "12345",
      to: "15551234567",
      mediaLink: "https://example.invalid/image.png",
      caption: "image",
    }).body, {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "15551234567",
      type: "image",
      image: {
        link: "https://example.invalid/image.png",
        caption: "image",
      },
    });

    assert.deepEqual(buildWhatsAppOperationRequest(testOperation("whatsapp.action.send-location-message"), {
      phoneNumberId: "12345",
      to: "15551234567",
      latitude: 37.485,
      longitude: -122.153,
      name: "Office",
      address: "1 Example Way",
    }).body, {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "15551234567",
      type: "location",
      location: {
        latitude: 37.485,
        longitude: -122.153,
        name: "Office",
        address: "1 Example Way",
      },
    });

    assert.deepEqual(buildWhatsAppOperationRequest(testOperation("whatsapp.action.send-template-message"), {
      phoneNumberId: "12345",
      to: "15551234567",
      templateName: "order_update",
      languageCode: "en_US",
      components: "[{\"type\":\"body\",\"parameters\":[{\"type\":\"text\",\"text\":\"A123\"}]}]",
    }).body, {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "15551234567",
      type: "template",
      template: {
        name: "order_update",
        language: { code: "en_US" },
        components: [{ type: "body", parameters: [{ type: "text", text: "A123" }] }],
      },
    });

    assert.deepEqual(buildWhatsAppOperationRequest(testOperation("whatsapp.action.mark-message-read"), {
      phoneNumberId: "12345",
      messageId: "wamid.sample",
    }).body, {
      messaging_product: "whatsapp",
      status: "read",
      message_id: "wamid.sample",
    });
  });

  it("exposes supported WhatsApp action slugs", () => {
    assert.deepEqual(WHATSAPP_ACTION_SLUGS, [
      "verify-phone-number",
      "send-message",
      "send-image-message",
      "send-document-message",
      "send-audio-message",
      "send-video-message",
      "send-sticker-message",
      "send-location-message",
      "send-contacts-message",
      "send-template-message",
      "mark-message-read",
    ]);
  });

  it("covers WhatsApp operations with operation-scoped offline fixtures", async () => {
    const coverage = verifyConnectorRuntimeCoverage(WHATSAPP_CATALOG);
    assert.equal(coverage.summary.missing, 0);
    assert.equal(coverage.summary.implemented, 2);

    const offline = await verifyConnectorRuntimeOfflineExecutions(WHATSAPP_CATALOG);
    assert.deepEqual(offline.results.map((result) => result.operationId).sort(), [
      "whatsapp.action.send-message",
      "whatsapp.action.verify-phone-number",
    ]);
  });
});

function operation(operationId: string) {
  const found = WHATSAPP_CATALOG.apps[0]?.operations.find((candidate) => candidate.id === operationId);
  assert.ok(found);
  return found;
}

function testOperation(operationId: string) {
  return {
    id: operationId,
    appId: "whatsapp",
    kind: "action" as const,
    name: operationId,
    fields: [],
    authFieldNames: ["whatsAppAccessToken"],
  };
}
