import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  findConnectorOperation,
  normalizeConnectorCatalog,
  searchConnectorCatalog,
  summarizeConnectorCatalog,
} from "./catalog.ts";
import { runConnectorOperation } from "./operation-runner.ts";
import { runConnectorSource } from "./source-runner.ts";
import type { ConnectorCatalog } from "./types.ts";

function fixtureCatalog(): ConnectorCatalog {
  return normalizeConnectorCatalog({
    version: 1,
    apps: [
      {
        id: "chat_service",
        name: "Chat Service",
        authFieldNames: ["bot"],
        fields: [
          { name: "bot", type: "app", optional: false, secret: true },
        ],
        operations: [
          {
            id: "chat_service.action.send-message",
            appId: "chat_service",
            kind: "action",
            name: "Send Message",
            fields: [
              { name: "channel", type: "string", optional: false },
              { name: "workspace", type: "$.workspace", optional: false },
              { name: "text", type: "string", optional: false },
              {
                name: "silent",
                type: "boolean",
                optional: true,
                default: false,
                options: [{ label: "Silent", value: true }],
              },
            ],
            authFieldNames: ["bot"],
            annotations: {
              destructiveHint: false,
              readOnlyHint: false,
              openWorldHint: true,
            },
            runtime: {
              hasRun: true,
              hasHooks: false,
              hasAdditionalProps: true,
              hasMethods: true,
            },
          },
          {
            id: "chat_service.source.new-message",
            appId: "chat_service",
            kind: "source",
            name: "New Message",
            fields: [
              { name: "channel", type: "string", optional: false },
              { name: "db", type: "$.service.db", optional: false, managed: true },
              { name: "http", type: "$.interface.http", optional: false, managed: true },
            ],
            authFieldNames: ["bot"],
            runtime: {
              hasRun: true,
              hasHooks: true,
              hasAdditionalProps: false,
              hasMethods: true,
              dedupe: "unique",
            },
            source: {
              delivery: "webhook",
              usesTimer: false,
              usesHttp: true,
              usesServiceDb: true,
            },
          },
        ],
      },
    ],
  });
}

describe("connector catalog", () => {
  it("normalizes, searches, and summarizes apps and operations", () => {
    const catalog = fixtureCatalog();
    assert.deepEqual(summarizeConnectorCatalog(catalog), {
      apps: 1,
      actions: 1,
      sources: 1,
      fields: 8,
      authFields: 3,
      managedFields: 3,
      defaults: 1,
      options: 1,
      annotatedOperations: 1,
      destructiveOperations: 0,
      readOnlyOperations: 0,
      openWorldOperations: 1,
      runnableOperations: 2,
      hookSources: 1,
      dedupedSources: 1,
      pollingSources: 0,
      webhookSources: 1,
      hybridSources: 0,
      statefulSources: 1,
      dynamicPropOperations: 1,
      methodOperations: 2,
    });
    assert.equal(searchConnectorCatalog(catalog, { query: "send", kind: "action" }).length, 1);
    assert.equal(searchConnectorCatalog(catalog, { query: "send", kind: "source" }).length, 0);
    assert.equal(findConnectorOperation(catalog, "chat_service.action.send-message")?.operation.name, "Send Message");
  });

  it("reports missing required values and secrets without executing", async () => {
    const dryRun = await runConnectorOperation({
      catalog: fixtureCatalog(),
      operationId: "chat_service.action.send-message",
      input: { values: { channel: "general" } },
    });
    assert.equal(dryRun.status, "dry_run");
    assert.deepEqual(dryRun.missingFields, ["text"]);
    assert.deepEqual(dryRun.missingSecrets, ["bot"]);
    assert.deepEqual(dryRun.values, { channel: "general", silent: false });
  });

  it("resolves secrets only when execution is explicitly enabled", async () => {
    const result = await runConnectorOperation({
      catalog: fixtureCatalog(),
      operationId: "chat_service.action.send-message",
      dryRun: false,
      input: {
        values: { channel: "general", text: "hello" },
        secretRefs: { bot: "secret://bot" },
      },
      resolveSecret: async (ref) => ref === "secret://bot" ? "resolved-token" : null,
      executor: {
        async execute(ctx) {
          assert.equal(ctx.secrets.bot, "resolved-token");
          return { ok: true, channel: ctx.values.channel };
        },
      },
    });
    assert.deepEqual(result, {
      status: "executed",
      operationId: "chat_service.action.send-message",
      appId: "chat_service",
      output: { ok: true, channel: "general" },
    });
  });

  it("plans source managed interfaces without resolving secrets", async () => {
    const plan = await runConnectorSource({
      catalog: fixtureCatalog(),
      operationId: "chat_service.source.new-message",
      input: { values: { channel: "general" } },
    });
    assert.equal(plan.status, "source_plan");
    assert.equal(plan.delivery, "webhook");
    assert.deepEqual(plan.missingFields, []);
    assert.deepEqual(plan.missingSecrets, ["bot"]);
    assert.equal(plan.dedupe, "unique");
    assert.equal(plan.hasHooks, true);
    assert.equal(plan.stateful, true);
    assert.deepEqual(plan.values, { channel: "general" });
    assert.deepEqual(plan.managedInterfaces, [
      { name: "db", type: "$.service.db", role: "service_db" },
      { name: "http", type: "$.interface.http", role: "http" },
    ]);
  });

  it("starts sources only with an explicit executor", async () => {
    const result = await runConnectorSource({
      catalog: fixtureCatalog(),
      operationId: "chat_service.source.new-message",
      dryRun: false,
      input: {
        values: { channel: "general" },
        secretRefs: { bot: "secret://bot" },
      },
      resolveSecret: async (ref) => ref === "secret://bot" ? "resolved-token" : null,
      executor: {
        async start(ctx) {
          assert.equal(ctx.secrets.bot, "resolved-token");
          assert.equal(ctx.plan.delivery, "webhook");
          return { subscribed: true, channel: ctx.values.channel };
        },
      },
    });
    assert.deepEqual(result, {
      status: "source_started",
      operationId: "chat_service.source.new-message",
      appId: "chat_service",
      output: { subscribed: true, channel: "general" },
    });
  });
});
