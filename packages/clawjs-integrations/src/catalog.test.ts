import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  findConnectorOperation,
  normalizeConnectorCatalog,
  searchConnectorCatalog,
  summarizeConnectorCatalog,
} from "./catalog.ts";
import { runConnectorOperation } from "./operation-runner.ts";
import {
  ConnectorSourceScheduler,
  runConnectorSource,
  sourceSubscriptionFromPlan,
} from "./source-runner.ts";
import type { ConnectorCatalog } from "./types.ts";

function fixtureCatalog(): ConnectorCatalog {
  return normalizeConnectorCatalog({
    version: 1,
    apps: [
      {
        id: "chat_service",
        name: "Chat Service",
        packageVersion: "1.2.3",
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
              { name: "license", type: "string", optional: false, secret: true },
              { name: "syncDir", type: "dir", optional: true, accessMode: "read", sync: true },
              { name: "notice", type: "alert", optional: true, alertType: "info", content: "Use a verified channel before sending." },
              { name: "thread", type: "string", optional: true, propDefinition: { fieldName: "threadId", contextKeys: ["channelId"], dependsOn: ["channel"] } },
              { name: "workspace", type: "$.workspace", optional: false },
              { name: "text", type: "string", optional: false },
              {
                name: "silent",
                type: "boolean",
                optional: true,
                default: false,
                options: [{ label: "Silent", value: true }],
                reloadProps: true,
                placeholder: "false",
                dynamicOptions: {
                  paginated: true,
                  usesPreviousContext: false,
                  contextKeys: ["page"],
                },
              },
            ],
            authFieldNames: ["bot", "license"],
            annotations: {
              destructiveHint: false,
              readOnlyHint: false,
              openWorldHint: true,
            },
            runtime: {
              hasRun: true,
              hasHooks: false,
              hasAdditionalProps: true,
              additionalProps: {
                mode: "function",
                fieldNames: ["thread"],
                contextKeys: ["channel"],
                usesPreviousProps: false,
                usesThis: true,
              },
              hasMethods: true,
              methodNames: ["request"],
            },
          },
          {
            id: "chat_service.source.new-message",
            appId: "chat_service",
            kind: "source",
            name: "New Message",
            fields: [
              { name: "channel", type: "string", optional: false },
              { name: "limit", type: "integer", optional: true, min: 1, max: 100, useQuery: true, withLabel: true },
              { name: "db", type: "$.service.db", optional: false, managed: true },
              { name: "http", type: "$.interface.http", optional: false, managed: true, customResponse: true },
            ],
            authFieldNames: ["bot"],
            runtime: {
              hasRun: true,
              hasHooks: true,
              hookNames: ["activate", "deactivate"],
              hasAdditionalProps: false,
              hasMethods: true,
              methodNames: ["subscribe"],
              dedupe: "unique",
            },
            source: {
              delivery: "webhook",
              usesTimer: false,
              usesHttp: true,
              usesServiceDb: true,
            },
            sampleEvent: {
              shape: "object",
              keys: ["message"],
            },
            eventSummary: {
              count: 2,
              templates: ["New Message: ${message.id}"],
              dynamic: true,
            },
          },
        ],
      },
    ],
  });
}

describe("connector catalog", () => {
  it("rejects unknown catalog contract versions", () => {
    assert.throws(
      () => normalizeConnectorCatalog({ version: 2, apps: [] }),
      /Unsupported catalog version: 2/,
    );
  });

  it("rejects unknown operation kinds", () => {
    assert.throws(
      () => normalizeConnectorCatalog({
        version: 1,
        apps: [{
          id: "chat_service",
          name: "Chat Service",
          authFieldNames: [],
          fields: [],
          operations: [{
            id: "chat_service.trigger.new-message",
            appId: "chat_service",
            kind: "trigger",
            name: "New Message",
            fields: [],
            authFieldNames: [],
          }],
        }],
      }),
      /Unsupported operation kind for chat_service\.trigger\.new-message: trigger/,
    );
  });

  it("normalizes, searches, and summarizes apps and operations", () => {
    const catalog = fixtureCatalog();
    assert.deepEqual(summarizeConnectorCatalog(catalog), {
      apps: 1,
      versionedApps: 1,
      actions: 1,
      sources: 1,
      fields: 13,
      authFields: 4,
      managedFields: 3,
      defaults: 1,
      options: 1,
      hiddenFields: 0,
      disabledFields: 0,
      reloadFields: 1,
      boundedFields: 1,
      placeholderFields: 1,
      queryFields: 1,
      labelFields: 1,
      alertFields: 1,
      readAccessFields: 1,
      writeAccessFields: 0,
      syncedFields: 1,
      customResponseFields: 1,
      propDefinitionFields: 1,
      contextualPropFields: 1,
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
      sampleEventSources: 1,
      eventSummarySources: 1,
      eventSummaryTemplates: 1,
      dynamicPropOperations: 1,
      dynamicPropFields: 1,
      dynamicOptionFields: 1,
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
    assert.deepEqual(dryRun.missingSecrets, ["bot", "license"]);
    assert.deepEqual(dryRun.invalidFields, []);
    assert.deepEqual(dryRun.values, { channel: "general", silent: false });
  });

  it("reports invalid option and range values without executing", async () => {
    const dryRun = await runConnectorOperation({
      catalog: fixtureCatalog(),
      operationId: "chat_service.action.send-message",
      input: { values: { channel: "general", text: "hello", silent: "loud" } },
    });
    assert.equal(dryRun.status, "dry_run");
    assert.deepEqual(dryRun.invalidFields, ["silent"]);

    const plan = await runConnectorSource({
      catalog: fixtureCatalog(),
      operationId: "chat_service.source.new-message",
      input: {
        values: { channel: "general", limit: 200 },
        secretRefs: { bot: "secret://bot" },
      },
    });
    assert.equal(plan.status, "source_plan");
    assert.deepEqual(plan.invalidFields, ["limit"]);
  });

  it("resolves secrets only when execution is explicitly enabled", async () => {
    const result = await runConnectorOperation({
      catalog: fixtureCatalog(),
      operationId: "chat_service.action.send-message",
      dryRun: false,
      input: {
        values: { channel: "general", text: "hello" },
        secretRefs: { bot: "secret://bot", license: "secret://license" },
      },
      resolveSecret: async (ref) => ref === "secret://bot" ? "resolved-token" : ref === "secret://license" ? "resolved-license" : null,
      executor: {
        async execute(ctx) {
          assert.equal(ctx.secrets.bot, "resolved-token");
          assert.equal(ctx.secrets.license, "resolved-license");
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
    assert.deepEqual(plan.invalidFields, []);
    assert.equal(plan.dedupe, "unique");
    assert.equal(plan.hasHooks, true);
    assert.equal(plan.stateful, true);
    assert.deepEqual(plan.values, { channel: "general" });
    assert.deepEqual(plan.managedInterfaces, [
      { name: "db", type: "$.service.db", role: "service_db" },
      { name: "http", type: "$.interface.http", role: "http", customResponse: true },
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

  it("builds blocked and ready source subscriptions from plans", async () => {
    const blockedPlan = await runConnectorSource({
      catalog: fixtureCatalog(),
      operationId: "chat_service.source.new-message",
      input: { values: { channel: "general" } },
    });
    const blocked = sourceSubscriptionFromPlan(blockedPlan, {
      now: "2026-05-12T12:00:00.000Z",
    });
    assert.equal(blocked.status, "blocked");
    assert.deepEqual(blocked.blockReasons, ["missing_secrets"]);
    assert.equal(blocked.createdAt, "2026-05-12T12:00:00.000Z");
    assert.equal(blocked.updatedAt, "2026-05-12T12:00:00.000Z");

    const readyPlan = await runConnectorSource({
      catalog: fixtureCatalog(),
      operationId: "chat_service.source.new-message",
      input: {
        values: { channel: "general" },
        secretRefs: { bot: "secret://bot" },
      },
    });
    const ready = sourceSubscriptionFromPlan(readyPlan, {
      id: "sub_1",
      now: "2026-05-12T12:01:00.000Z",
    });
    assert.equal(ready.id, "sub_1");
    assert.equal(ready.status, "ready");
    assert.deepEqual(ready.blockReasons, []);
    assert.equal(ready.delivery, "webhook");
    assert.equal(ready.stateful, true);
  });

  it("stores local source subscriptions without starting providers", async () => {
    const scheduler = new ConnectorSourceScheduler();
    const plan = await runConnectorSource({
      catalog: fixtureCatalog(),
      operationId: "chat_service.source.new-message",
      input: {
        values: { channel: "general" },
        secretRefs: { bot: "secret://bot" },
      },
    });
    const first = scheduler.register(plan, {
      id: "sub_1",
      now: "2026-05-12T12:00:00.000Z",
    });
    const second = scheduler.register(plan, {
      id: "sub_1",
      enabled: false,
      now: "2026-05-12T12:02:00.000Z",
    });

    assert.equal(first.status, "ready");
    assert.equal(second.status, "disabled");
    assert.deepEqual(second.blockReasons, ["disabled"]);
    assert.equal(second.createdAt, "2026-05-12T12:00:00.000Z");
    assert.equal(second.updatedAt, "2026-05-12T12:02:00.000Z");
    assert.deepEqual(scheduler.list(), [second]);
    assert.equal(scheduler.get("sub_1"), second);
    assert.equal(scheduler.unregister("sub_1"), true);
    assert.deepEqual(scheduler.list(), []);
  });
});
