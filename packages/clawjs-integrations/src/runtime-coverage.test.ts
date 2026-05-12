import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeConnectorCatalog } from "./catalog.ts";
import {
  buildConnectorOperationRuntimePlan,
  evaluateConnectorRuntimeCoverage,
  verifyConnectorRuntimeCoverage,
} from "./runtime-coverage.ts";

describe("connector runtime coverage", () => {
  it("fails when a catalog operation has no offline-validable runtime implementation", () => {
    const catalog = normalizeConnectorCatalog({
      version: 1,
      apps: [{
        id: "fixture_service",
        name: "Fixture Service",
        authFieldNames: ["apiKey"],
        fields: [{ name: "apiKey", type: "string", optional: false, secret: true }],
        operations: [{
          id: "fixture_service.action.send-message",
          appId: "fixture_service",
          kind: "action",
          name: "Send Message",
          fields: [{ name: "text", type: "string", optional: false }],
          authFieldNames: ["apiKey"],
        }],
      }],
    });

    const report = evaluateConnectorRuntimeCoverage(catalog);
    assert.deepEqual(report.summary, {
      total: 1,
      implemented: 0,
      unsupported: 0,
      missing: 1,
      offlineValidated: 0,
    });
    assert.throws(
      () => verifyConnectorRuntimeCoverage(catalog),
      /missing runtime implementation for fixture_service\.action\.send-message/,
    );
  });

  it("accepts supported Telegram actions and prepares an offline request plan", () => {
    const catalog = normalizeConnectorCatalog({
      version: 1,
      apps: [{
        id: "telegram_bot_api",
        name: "Telegram Bot",
        authFieldNames: ["telegramBotApi"],
        fields: [{ name: "telegramBotApi", type: "app", optional: false, secret: true }],
        operations: [{
          id: "telegram_bot_api.action.send-text-message-or-reply-send-text-message-or-reply",
          appId: "telegram_bot_api",
          kind: "action",
          name: "Send Text Message",
          fields: [
            { name: "chatId", type: "string", optional: false },
            { name: "text", type: "string", optional: false },
          ],
          authFieldNames: ["telegramBotApi"],
        }],
      }],
    });

    const report = verifyConnectorRuntimeCoverage(catalog);
    assert.equal(report.summary.implemented, 1);
    assert.equal(report.summary.missing, 0);

    const operation = catalog.apps[0]?.operations[0];
    assert.ok(operation);
    assert.deepEqual(buildConnectorOperationRuntimePlan(operation, { chatId: "123", text: "hello" }), {
      status: "implemented",
      operationId: "telegram_bot_api.action.send-text-message-or-reply-send-text-message-or-reply",
      appId: "telegram_bot_api",
      kind: "action",
      executorId: "telegram-bot-api.action.http",
      offlineValidated: true,
      evidence: ["packages/clawjs-integrations/src/telegram-operation-executor.test.ts"],
      requestPlan: {
        method: "POST",
        endpoint: "sendMessage",
        auth: [{ type: "secret", field: "telegramBotApi" }],
        body: {
          chat_id: "123",
          text: "hello",
        },
      },
    });
  });

  it("preserves structured unsupported reasons but fails them by default", () => {
    const catalog = normalizeConnectorCatalog({
      version: 1,
      apps: [{
        id: "manual_service",
        name: "Manual Service",
        authFieldNames: [],
        fields: [],
        operations: [{
          id: "manual_service.source.external-only",
          appId: "manual_service",
          kind: "source",
          name: "External Only",
          fields: [],
          authFieldNames: [],
          unsupported_real_runtime_reason: {
            code: "missing_reference_contract",
            message: "The available component metadata does not include a request contract.",
            evidence: ["component source has no run or hook body"],
          },
        }],
      }],
    });

    const operation = catalog.apps[0]?.operations[0];
    assert.deepEqual(operation?.unsupported_real_runtime_reason, {
      code: "missing_reference_contract",
      message: "The available component metadata does not include a request contract.",
      evidence: ["component source has no run or hook body"],
    });
    assert.throws(
      () => verifyConnectorRuntimeCoverage(catalog),
      /unsupported runtime implementation for manual_service\.source\.external-only/,
    );
    assert.equal(verifyConnectorRuntimeCoverage(catalog, { allowUnsupportedReasons: true }).summary.unsupported, 1);
  });

  it("rejects unsupported reasons without concrete evidence", () => {
    const catalog = normalizeConnectorCatalog({
      version: 1,
      apps: [{
        id: "manual_service",
        name: "Manual Service",
        authFieldNames: [],
        fields: [],
        operations: [{
          id: "manual_service.source.external-only",
          appId: "manual_service",
          kind: "source",
          name: "External Only",
          fields: [],
          authFieldNames: [],
          unsupported_real_runtime_reason: {
            code: "missing_reference_contract",
            message: "The available component metadata does not include a request contract.",
            evidence: [],
          },
        }],
      }],
    });

    assert.throws(
      () => verifyConnectorRuntimeCoverage(catalog, { allowUnsupportedReasons: true }),
      /requires concrete evidence/,
    );
  });
});
