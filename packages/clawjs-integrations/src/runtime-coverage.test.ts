import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeConnectorCatalog } from "./catalog.ts";
import {
  buildConnectorOperationRuntimePlan,
  buildConnectorRuntimeAudit,
  evaluateConnectorRuntimeCoverage,
  verifyConnectorRuntimeCoverage,
  type ConnectorRuntimeCoverageReport,
} from "./runtime-coverage.ts";
import type { ConnectorRuntimeImplementation } from "./runtime-registry.ts";
import type { IntegrationJson } from "./types.ts";

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
        responseSchema: {
          type: "object",
          requiredPaths: ["ok"],
        },
      },
    });
  });

  it("accepts supported Telegram sources and prepares an offline polling plan", () => {
    const catalog = normalizeConnectorCatalog({
      version: 1,
      apps: [{
        id: "telegram_bot_api",
        name: "Telegram Bot",
        authFieldNames: ["telegramBotApi"],
        fields: [{ name: "telegramBotApi", type: "app", optional: false, secret: true }],
        operations: [{
          id: "telegram_bot_api.source.new-bot-command-received-new-bot-command-received",
          appId: "telegram_bot_api",
          kind: "source",
          name: "New Bot Command",
          fields: [
            { name: "commands", type: "string", optional: true },
            { name: "offset", type: "integer", optional: true },
            { name: "timer", type: "$.interface.timer", optional: false, managed: true },
          ],
          authFieldNames: ["telegramBotApi"],
          runtime: {
            hasRun: false,
            hasHooks: true,
            hookNames: ["deploy"],
            hasAdditionalProps: false,
            hasMethods: false,
            methodNames: [],
            dedupe: "unique",
          },
          source: {
            delivery: "polling",
            usesTimer: true,
            usesHttp: false,
            usesServiceDb: false,
          },
        }],
      }],
    });

    const operation = catalog.apps[0]?.operations[0];
    assert.ok(operation);
    assert.deepEqual(buildConnectorOperationRuntimePlan(operation, { offset: 10 }), {
      status: "implemented",
      operationId: "telegram_bot_api.source.new-bot-command-received-new-bot-command-received",
      appId: "telegram_bot_api",
      kind: "source",
      executorId: "telegram-bot-api.source.polling",
      offlineValidated: true,
      evidence: ["packages/clawjs-integrations/src/telegram-source.test.ts"],
      requestPlan: {
        method: "GET",
        endpoint: "getUpdates",
        auth: [{ type: "secret", field: "telegramBotApi" }],
        headers: { accept: "application/json" },
        query: {
          timeout: "0",
          allowed_updates: "[\"message\",\"edited_message\",\"channel_post\",\"edited_channel_post\"]",
          offset: 10,
        },
        body: {},
        responseSchema: {
          type: "object",
          requiredPaths: ["ok"],
        },
      },
      sourcePlan: {
        delivery: "polling",
        dedupe: "unique",
        hooks: ["deploy"],
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
            evidence: ["packages/clawjs-integrations/src/runtime-coverage.test.ts"],
          },
        }],
      }],
    });

    const operation = catalog.apps[0]?.operations[0];
    assert.deepEqual(operation?.unsupported_real_runtime_reason, {
      code: "missing_reference_contract",
      message: "The available component metadata does not include a request contract.",
      evidence: ["packages/clawjs-integrations/src/runtime-coverage.test.ts"],
    });
    assert.throws(
      () => verifyConnectorRuntimeCoverage(catalog),
      /unsupported runtime implementation for manual_service\.source\.external-only/,
    );
    assert.equal(verifyConnectorRuntimeCoverage(catalog, { allowUnsupportedReasons: true }).summary.unsupported, 1);
  });

  it("builds final audit summaries with impossible and partial operation states", () => {
    const catalog = normalizeConnectorCatalog({
      version: 1,
      apps: [{
        id: "fixture_service",
        name: "Fixture Service",
        authFieldNames: [],
        fields: [],
        operations: [
          {
            id: "fixture_service.action.ready",
            appId: "fixture_service",
            kind: "action",
            name: "Ready",
            fields: [],
            authFieldNames: [],
          },
          {
            id: "fixture_service.action.partial",
            appId: "fixture_service",
            kind: "action",
            name: "Partial",
            fields: [],
            authFieldNames: [],
          },
          {
            id: "fixture_service.action.missing",
            appId: "fixture_service",
            kind: "action",
            name: "Missing",
            fields: [],
            authFieldNames: [],
          },
          {
            id: "fixture_service.source.external-only",
            appId: "fixture_service",
            kind: "source",
            name: "External Only",
            fields: [],
            authFieldNames: [],
            unsupported_real_runtime_reason: {
              code: "external_contract_unavailable",
              message: "The provider does not expose enough local contract data for offline validation.",
              evidence: ["packages/clawjs-integrations/src/runtime-coverage.test.ts"],
            },
          },
        ],
      }],
    });
    const coverageReport: ConnectorRuntimeCoverageReport = {
      summary: {
        total: 4,
        implemented: 2,
        unsupported: 1,
        missing: 1,
        offlineValidated: 2,
      },
      entries: [
        {
          operationId: "fixture_service.action.ready",
          appId: "fixture_service",
          kind: "action",
          status: "implemented",
          executorId: "fixture.ready",
          offlineValidated: true,
          evidence: ["packages/clawjs-integrations/src/runtime-coverage.test.ts"],
          fixtures: [{
            kind: "response",
            path: "packages/clawjs-integrations/fixtures/fixture-action-response.json",
          }],
        },
        {
          operationId: "fixture_service.action.partial",
          appId: "fixture_service",
          kind: "action",
          status: "implemented",
          executorId: "fixture.partial",
          offlineValidated: true,
          evidence: ["packages/clawjs-integrations/src/runtime-coverage.test.ts"],
          fixtures: [{
            kind: "response",
            path: "packages/clawjs-integrations/fixtures/fixture-action-response.json",
          }],
        },
        {
          operationId: "fixture_service.action.missing",
          appId: "fixture_service",
          kind: "action",
          status: "missing",
          offlineValidated: false,
          evidence: [],
          fixtures: [],
        },
        {
          operationId: "fixture_service.source.external-only",
          appId: "fixture_service",
          kind: "source",
          status: "unsupported",
          offlineValidated: false,
          evidence: ["packages/clawjs-integrations/src/runtime-coverage.test.ts"],
          fixtures: [],
          unsupported_real_runtime_reason: {
            code: "external_contract_unavailable",
            message: "The provider does not expose enough local contract data for offline validation.",
            evidence: ["packages/clawjs-integrations/src/runtime-coverage.test.ts"],
          },
        },
      ],
      errors: [
        "runtime implementation for fixture_service.action.partial requires a runtime plan builder",
        "missing runtime implementation for fixture_service.action.missing",
      ],
    };

    const audit = buildConnectorRuntimeAudit(catalog, coverageReport);

    assert.deepEqual(audit.summary, {
      total: 4,
      implemented: 1,
      missing: 1,
      partial: 1,
      impossible: 1,
      offlineValidated: 2,
    });
    assert.deepEqual(audit.providers[0]?.summary, audit.summary);
    assert.deepEqual(audit.providers[0]?.operations.map((operation) => operation.status), [
      "implemented",
      "partial",
      "missing",
      "impossible",
    ]);
    assert.deepEqual(audit.providers[0]?.operations[1]?.errors, [
      "runtime implementation for fixture_service.action.partial requires a runtime plan builder",
    ]);
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

  it("rejects unsupported reasons without local evidence files", () => {
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
            evidence: ["missing/evidence-file.test.ts"],
          },
        }],
      }],
    });

    assert.throws(
      () => verifyConnectorRuntimeCoverage(catalog, { allowUnsupportedReasons: true }),
      /evidence file not found: missing\/evidence-file\.test\.ts/,
    );
  });

  it("accepts operation implementations from an explicit runtime registry", () => {
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
    const registry: ConnectorRuntimeImplementation[] = [{
      appId: "fixture_service",
      kind: "action",
      executorId: "fixture.action.offline",
      offlineValidated: true,
      evidence: ["packages/clawjs-integrations/src/runtime-coverage.test.ts"],
      fixtures: [{
        kind: "response",
        path: "packages/clawjs-integrations/fixtures/fixture-action-response.json",
      }],
      planKinds: ["request"],
      supports: (operation) => operation.id === "fixture_service.action.send-message",
      createExecutor: () => ({
        async execute() {
          return { ok: true };
        },
      }),
      buildPlan: (operation, values) => ({
        requestPlan: {
          method: "POST",
          endpoint: "messages",
          auth: operation.authFieldNames.map((field) => ({ type: "secret", field })),
          body: values,
          responseSchema: { type: "object" },
        },
      }),
    }];

    const report = verifyConnectorRuntimeCoverage(catalog, { registry });
    assert.equal(report.summary.implemented, 1);

    const operation = catalog.apps[0]?.operations[0];
    assert.ok(operation);
    assert.deepEqual(buildConnectorOperationRuntimePlan(operation, { text: "hello" }, { registry }), {
      status: "implemented",
      operationId: "fixture_service.action.send-message",
      appId: "fixture_service",
      kind: "action",
      executorId: "fixture.action.offline",
      offlineValidated: true,
      evidence: ["packages/clawjs-integrations/src/runtime-coverage.test.ts"],
      requestPlan: {
        method: "POST",
        endpoint: "messages",
        auth: [{ type: "secret", field: "apiKey" }],
        body: {
          text: "hello",
        },
        responseSchema: { type: "object" },
      },
    });
  });

  it("rejects registry implementations without offline evidence", () => {
    const catalog = normalizeConnectorCatalog({
      version: 1,
      apps: [{
        id: "fixture_service",
        name: "Fixture Service",
        authFieldNames: [],
        fields: [],
        operations: [{
          id: "fixture_service.action.send-message",
          appId: "fixture_service",
          kind: "action",
          name: "Send Message",
          fields: [],
          authFieldNames: [],
        }],
      }],
    });
    const registry: ConnectorRuntimeImplementation[] = [{
      appId: "fixture_service",
      kind: "action",
      executorId: "fixture.action.offline",
      offlineValidated: false,
      evidence: [],
      planKinds: [],
      supports: (operation) => operation.id === "fixture_service.action.send-message",
    }];

    assert.throws(
      () => verifyConnectorRuntimeCoverage(catalog, { registry }),
      /requires offline validation.*requires concrete evidence/s,
    );
  });

  it("rejects registry implementations without offline fixtures", () => {
    const catalog = normalizeConnectorCatalog({
      version: 1,
      apps: [{
        id: "fixture_service",
        name: "Fixture Service",
        authFieldNames: [],
        fields: [],
        operations: [{
          id: "fixture_service.action.send-message",
          appId: "fixture_service",
          kind: "action",
          name: "Send Message",
          fields: [],
          authFieldNames: [],
        }],
      }],
    });
    const registry: ConnectorRuntimeImplementation[] = [{
      appId: "fixture_service",
      kind: "action",
      executorId: "fixture.action.offline",
      offlineValidated: true,
      evidence: ["packages/clawjs-integrations/src/runtime-coverage.test.ts"],
      planKinds: ["request"],
      supports: (operation) => operation.id === "fixture_service.action.send-message",
      createExecutor: () => ({
        async execute() {
          return { ok: true };
        },
      }),
      buildPlan: () => ({
        requestPlan: {
          method: "POST",
          endpoint: "messages",
          auth: [],
          body: {},
          responseSchema: { type: "object" },
        },
      }),
    }];

    assert.throws(
      () => verifyConnectorRuntimeCoverage(catalog, { registry }),
      /requires offline fixtures/,
    );
  });

  it("rejects ambiguous registry implementations for the same operation", () => {
    const catalog = normalizeConnectorCatalog({
      version: 1,
      apps: [{
        id: "fixture_service",
        name: "Fixture Service",
        authFieldNames: [],
        fields: [],
        operations: [{
          id: "fixture_service.action.send-message",
          appId: "fixture_service",
          kind: "action",
          name: "Send Message",
          fields: [],
          authFieldNames: [],
        }],
      }],
    });
    const implementation = (executorId: string): ConnectorRuntimeImplementation => ({
      appId: "fixture_service",
      kind: "action",
      executorId,
      offlineValidated: true,
      evidence: ["packages/clawjs-integrations/src/runtime-coverage.test.ts"],
      planKinds: ["request"],
      supports: (operation) => operation.id === "fixture_service.action.send-message",
      createExecutor: () => ({
        async execute() {
          return { ok: true };
        },
      }),
      buildPlan: () => ({
        requestPlan: {
          method: "POST",
          endpoint: "messages",
          auth: [],
          body: {},
        },
      }),
    });
    const registry = [
      implementation("fixture.action.primary"),
      implementation("fixture.action.duplicate"),
    ];

    assert.throws(
      () => verifyConnectorRuntimeCoverage(catalog, { registry }),
      /is ambiguous: fixture\.action\.primary, fixture\.action\.duplicate/,
    );
  });

  it("rejects registry implementations without local evidence files", () => {
    const catalog = normalizeConnectorCatalog({
      version: 1,
      apps: [{
        id: "fixture_service",
        name: "Fixture Service",
        authFieldNames: [],
        fields: [],
        operations: [{
          id: "fixture_service.action.send-message",
          appId: "fixture_service",
          kind: "action",
          name: "Send Message",
          fields: [],
          authFieldNames: [],
        }],
      }],
    });
    const registry: ConnectorRuntimeImplementation[] = [{
      appId: "fixture_service",
      kind: "action",
      executorId: "fixture.action.offline",
      offlineValidated: true,
      evidence: ["missing/runtime-evidence.test.ts"],
      planKinds: ["request"],
      supports: (operation) => operation.id === "fixture_service.action.send-message",
      createExecutor: () => ({
        async execute() {
          return { ok: true };
        },
      }),
      buildPlan: (operation) => ({
        requestPlan: {
          method: "POST",
          endpoint: "messages",
          auth: operation.authFieldNames.map((field) => ({ type: "secret", field })),
          body: {},
        },
      }),
    }];

    assert.throws(
      () => verifyConnectorRuntimeCoverage(catalog, { registry }),
      /evidence file not found: missing\/runtime-evidence\.test\.ts/,
    );
  });

  it("rejects registry implementations without executors or plan kinds", () => {
    const catalog = normalizeConnectorCatalog({
      version: 1,
      apps: [{
        id: "fixture_service",
        name: "Fixture Service",
        authFieldNames: [],
        fields: [],
        operations: [{
          id: "fixture_service.source.poll",
          appId: "fixture_service",
          kind: "source",
          name: "Poll",
          fields: [],
          authFieldNames: [],
          source: {
            delivery: "polling",
            usesTimer: true,
            usesHttp: false,
            usesServiceDb: false,
          },
        }],
      }],
    });
    const registry: ConnectorRuntimeImplementation[] = [{
      appId: "fixture_service",
      kind: "source",
      executorId: "fixture.source.offline",
      offlineValidated: true,
      evidence: ["packages/clawjs-integrations/src/runtime-coverage.test.ts"],
      planKinds: [],
      supports: (operation) => operation.id === "fixture_service.source.poll",
    }];

    assert.throws(
      () => verifyConnectorRuntimeCoverage(catalog, { registry }),
      /requires a registered source executor.*requires a source plan kind.*requires a request plan kind.*requires a runtime plan builder/s,
    );
  });

  it("rejects plan builders that do not return declared plan kinds", () => {
    const catalog = normalizeConnectorCatalog({
      version: 1,
      apps: [{
        id: "fixture_service",
        name: "Fixture Service",
        authFieldNames: [],
        fields: [],
        operations: [{
          id: "fixture_service.action.send-message",
          appId: "fixture_service",
          kind: "action",
          name: "Send Message",
          fields: [{ name: "text", type: "string", optional: false }],
          authFieldNames: [],
        }],
      }],
    });
    const registry: ConnectorRuntimeImplementation[] = [{
      appId: "fixture_service",
      kind: "action",
      executorId: "fixture.action.offline",
      offlineValidated: true,
      evidence: ["packages/clawjs-integrations/src/runtime-coverage.test.ts"],
      planKinds: ["request"],
      supports: (operation) => operation.id === "fixture_service.action.send-message",
      createExecutor: () => ({
        async execute() {
          return { ok: true };
        },
      }),
      buildPlan: () => ({}),
    }];

    assert.throws(
      () => verifyConnectorRuntimeCoverage(catalog, { registry }),
      /must build a request plan/,
    );
  });

  it("rejects request plans with non-serializable request details", () => {
    const catalog = normalizeConnectorCatalog({
      version: 1,
      apps: [{
        id: "fixture_service",
        name: "Fixture Service",
        authFieldNames: [],
        fields: [],
        operations: [{
          id: "fixture_service.action.send-message",
          appId: "fixture_service",
          kind: "action",
          name: "Send Message",
          fields: [],
          authFieldNames: [],
        }],
      }],
    });
    const registry: ConnectorRuntimeImplementation[] = [{
      appId: "fixture_service",
      kind: "action",
      executorId: "fixture.action.offline",
      offlineValidated: true,
      evidence: ["packages/clawjs-integrations/src/runtime-coverage.test.ts"],
      planKinds: ["request"],
      supports: (operation) => operation.id === "fixture_service.action.send-message",
      createExecutor: () => ({
        async execute() {
          return { ok: true };
        },
      }),
      buildPlan: () => ({
        requestPlan: {
          method: "POST",
          endpoint: "messages",
          auth: [],
          headers: { accept: 1 } as unknown as Record<string, string>,
          query: { cursor: undefined } as unknown as Record<string, IntegrationJson>,
          body: { text: () => "hello" } as unknown as Record<string, IntegrationJson>,
        },
      }),
    }];

    assert.throws(
      () => verifyConnectorRuntimeCoverage(catalog, { registry }),
      /must build a request plan/,
    );
  });

  it("rejects request plans with mismatched auth bindings", () => {
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
    const registry: ConnectorRuntimeImplementation[] = [{
      appId: "fixture_service",
      kind: "action",
      executorId: "fixture.action.offline",
      offlineValidated: true,
      evidence: ["packages/clawjs-integrations/src/runtime-coverage.test.ts"],
      planKinds: ["request"],
      supports: (operation) => operation.id === "fixture_service.action.send-message",
      createExecutor: () => ({
        async execute() {
          return { ok: true };
        },
      }),
      buildPlan: () => ({
        requestPlan: {
          method: "POST",
          endpoint: "messages",
          auth: [{ type: "secret", field: "wrongKey" }],
          body: {},
        },
      }),
    }];

    assert.throws(
      () => verifyConnectorRuntimeCoverage(catalog, { registry }),
      /request plan auth missing apiKey.*request plan auth includes unknown wrongKey/s,
    );
  });

  it("rejects request auth bindings without required transport targets", () => {
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
          fields: [],
          authFieldNames: ["apiKey"],
        }],
      }],
    });
    const registry: ConnectorRuntimeImplementation[] = [{
      appId: "fixture_service",
      kind: "action",
      executorId: "fixture.action.offline",
      offlineValidated: true,
      evidence: ["packages/clawjs-integrations/src/runtime-coverage.test.ts"],
      planKinds: ["request"],
      supports: (operation) => operation.id === "fixture_service.action.send-message",
      createExecutor: () => ({
        async execute() {
          return { ok: true };
        },
      }),
      buildPlan: () => ({
        requestPlan: {
          method: "POST",
          endpoint: "messages",
          auth: [{ type: "secret", field: "apiKey", placement: "header" }],
          body: {},
        },
      }),
    }];

    assert.throws(
      () => verifyConnectorRuntimeCoverage(catalog, { registry }),
      /must build a request plan/,
    );
  });

  it("rejects source plans that do not match the source contract", () => {
    const catalog = normalizeConnectorCatalog({
      version: 1,
      apps: [{
        id: "fixture_service",
        name: "Fixture Service",
        authFieldNames: [],
        fields: [],
        operations: [{
          id: "fixture_service.source.poll",
          appId: "fixture_service",
          kind: "source",
          name: "Poll",
          fields: [],
          authFieldNames: [],
          runtime: {
            hasRun: true,
            hasHooks: true,
            hookNames: ["deploy"],
            hasAdditionalProps: false,
            hasMethods: false,
            methodNames: [],
            dedupe: "unique",
          },
          source: {
            delivery: "polling",
            usesTimer: true,
            usesHttp: false,
            usesServiceDb: false,
          },
        }],
      }],
    });
    const registry: ConnectorRuntimeImplementation[] = [{
      appId: "fixture_service",
      kind: "source",
      executorId: "fixture.source.offline",
      offlineValidated: true,
      evidence: ["packages/clawjs-integrations/src/runtime-coverage.test.ts"],
      planKinds: ["request", "source"],
      supports: (operation) => operation.id === "fixture_service.source.poll",
      createSourceExecutor: () => ({
        async start() {
          return { ok: true };
        },
      }),
      buildPlan: () => ({
        requestPlan: {
          method: "GET",
          endpoint: "poll",
          auth: [],
          body: {},
        },
        sourcePlan: {
          delivery: "webhook",
          hooks: ["activate"],
          dedupe: "none",
        },
      }),
    }];

    assert.throws(
      () => verifyConnectorRuntimeCoverage(catalog, { registry }),
      /source plan delivery webhook expected polling.*source plan hooks activate expected deploy.*source plan dedupe none expected unique/s,
    );
  });
});
