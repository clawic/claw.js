import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";

import {
  findConnectorOperation,
  normalizeConnectorCatalog,
  searchConnectorCatalog,
  summarizeConnectorCatalog,
  verifyStableConnectorCatalog,
} from "./catalog.ts";
import { runConnectorOperation } from "./operation-runner.ts";
import {
  ConnectorSourceScheduler,
  runConnectorSource,
  sourceSubscriptionFromPlan,
} from "./source-runner.ts";
import type { ConnectorRuntimeImplementation } from "./runtime-registry.ts";
import type { ConnectorCatalog } from "./types.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

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
            support: {
              state: "supported",
              reason: "Offline request fixtures cover the stable send-message action.",
              testOrScenario: "packages/clawjs-integrations/src/catalog.test.ts",
            },
            externalSchema: {
              status: "complete",
              source: "https://api.example.invalid/openapi.json",
              providerVersion: "2026-05-14",
              evidence: ["packages/clawjs-integrations/src/catalog.test.ts"],
              inputSchema: { type: "object", required: ["channel", "text"] },
              outputSchema: { type: "object", required: ["id"] },
            },
            executionPolicy: {
              readOnly: false,
              requiresAuth: true,
              requiresHostApproval: false,
              destructive: false,
              costRisk: false,
              dryRunSupported: true,
              auditRequired: true,
            },
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
            support: {
              state: "external_pending",
              reason: "Webhook delivery needs provider-side registration before it can be stable.",
              testOrScenario: "EXTERNAL PENDING provider webhook endpoint",
            },
            externalSchema: {
              status: "external_pending",
              source: "https://api.example.invalid/openapi.json",
              evidence: ["packages/clawjs-integrations/src/catalog.test.ts"],
            },
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
      supportedOperations: 1,
      partialOperations: 0,
      externalPendingOperations: 1,
      completeExternalSchemas: 1,
      partialExternalSchemas: 1,
      missingExternalSchemas: 0,
      hostApprovalOperations: 0,
      authRequiredOperations: 1,
      costRiskOperations: 0,
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
    assert.deepEqual(verifyStableConnectorCatalog(catalog, { evidenceRoot: repoRoot }), {
      stableOperations: 1,
      completeExternalSchemas: 1,
      errors: [],
    });
  });

  it("rejects stable connector operations without complete external schemas", () => {
    const catalog = normalizeConnectorCatalog({
      version: 1,
      apps: [{
        id: "chat_service",
        name: "Chat Service",
        authFieldNames: ["bot"],
        fields: [],
        operations: [{
          id: "chat_service.action.send-message",
          appId: "chat_service",
          kind: "action",
          name: "Send Message",
          fields: [{ name: "text", type: "string", optional: false }],
          authFieldNames: ["bot"],
          support: {
            state: "supported",
            reason: "The action is part of the public connector surface.",
          },
          externalSchema: {
            status: "partial",
            source: "https://api.example.invalid/openapi.json",
            evidence: ["packages/clawjs-integrations/src/catalog.test.ts"],
            inputSchema: { type: "object" },
          },
          executionPolicy: {
            readOnly: false,
            requiresAuth: false,
            requiresHostApproval: false,
            destructive: false,
            costRisk: false,
            dryRunSupported: true,
            auditRequired: true,
          },
        }],
      }],
    });

    assert.throws(
      () => verifyStableConnectorCatalog(catalog, { evidenceRoot: repoRoot }),
      /requiresAuth.*requires complete external schema status.*requires an output schema/s,
    );
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

  it("includes registered runtime request plans in operation dry-runs", async () => {
    const registry: ConnectorRuntimeImplementation[] = [{
      appId: "chat_service",
      kind: "action",
      executorId: "chat.action.http",
      baseUrl: "https://api.example.invalid/",
      offlineValidated: true,
      evidence: ["packages/clawjs-integrations/src/catalog.test.ts"],
      fixtures: [
        { kind: "request", path: "packages/clawjs-integrations/fixtures/fixture-action-request.json" },
        { kind: "response", path: "packages/clawjs-integrations/fixtures/fixture-action-response.json" },
      ],
      planKinds: ["request"],
      supports: (operation) => operation.id === "chat_service.action.send-message",
      buildPlan: (operation, values) => ({
        requestPlan: {
          method: "POST",
          endpoint: "messages",
          auth: operation.authFieldNames.map((field) => ({ type: "secret", field, placement: "bearer" })),
          body: { channel: values.channel ?? null, text: values.text ?? null },
          responseSchema: { type: "object" },
        },
      }),
    }];

    const dryRun = await runConnectorOperation({
      catalog: fixtureCatalog(),
      operationId: "chat_service.action.send-message",
      input: {
        values: { channel: "general", workspace: { id: "workspace_1" }, text: "hello" },
        secretRefs: { bot: "secret://bot", license: "secret://license" },
      },
      runtimeRegistry: registry,
    });

    assert.equal(dryRun.status, "dry_run");
    assert.deepEqual(dryRun.missingSecrets, []);
    assert.deepEqual(dryRun.runtime?.requestPlan, {
      method: "POST",
      endpoint: "messages",
      auth: [
        { type: "secret", field: "bot", placement: "bearer" },
        { type: "secret", field: "license", placement: "bearer" },
      ],
      body: { channel: "general", text: "hello" },
      responseSchema: { type: "object" },
    });
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

  it("reports invalid field types without executing", async () => {
    const dryRun = await runConnectorOperation({
      catalog: fixtureCatalog(),
      operationId: "chat_service.action.send-message",
      input: {
        values: {
          channel: ["general"],
          syncDir: { path: "/tmp" },
          workspace: { id: "workspace_1" },
          text: false,
          silent: true,
        },
      },
    });

    assert.equal(dryRun.status, "dry_run");
    assert.deepEqual(dryRun.invalidFields, ["channel", "syncDir", "text"]);

    const plan = await runConnectorSource({
      catalog: fixtureCatalog(),
      operationId: "chat_service.source.new-message",
      input: {
        values: { channel: "general", limit: 1.5 },
        secretRefs: { bot: "secret://bot" },
      },
    });

    assert.equal(plan.status, "source_plan");
    assert.deepEqual(plan.invalidFields, ["limit"]);
  });

  it("fails closed when action execution would require plaintext secrets", async () => {
    await assert.rejects(
      runConnectorOperation({
        catalog: fixtureCatalog(),
        operationId: "chat_service.action.send-message",
        dryRun: false,
        input: {
          values: { channel: "general", text: "hello" },
          secretRefs: { bot: "secret://bot", license: "secret://license" },
        },
        executor: {
          async execute() {
            throw new Error("executor must not receive plaintext secrets");
          },
        },
        controlPlane: fixtureControlPlane(),
      }),
      /requires a capability broker/,
    );
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

  it("includes registered runtime source plans in source dry-runs", async () => {
    const registry: ConnectorRuntimeImplementation[] = [{
      appId: "chat_service",
      kind: "source",
      executorId: "chat.source.http",
      baseUrl: "https://api.example.invalid/",
      offlineValidated: true,
      evidence: ["packages/clawjs-integrations/src/catalog.test.ts"],
      fixtures: [
        { kind: "request", path: "packages/clawjs-integrations/fixtures/fixture-action-request.json" },
        { kind: "source_event", path: "packages/clawjs-integrations/fixtures/fixture-action-response.json" },
      ],
      planKinds: ["request", "source"],
      supports: (operation) => operation.id === "chat_service.source.new-message",
      buildPlan: (operation, values) => ({
        requestPlan: {
          method: "GET",
          endpoint: "messages",
          auth: operation.authFieldNames.map((field) => ({ type: "secret", field, placement: "bearer" })),
          query: { channel: values.channel ?? null },
          body: {},
          responseSchema: { type: "object" },
        },
        sourcePlan: {
          delivery: operation.source?.delivery ?? "manual",
          hooks: operation.runtime?.hookNames ?? [],
          dedupe: operation.runtime?.dedupe,
          eventsPath: "messages",
        },
      }),
    }];

    const plan = await runConnectorSource({
      catalog: fixtureCatalog(),
      operationId: "chat_service.source.new-message",
      input: {
        values: { channel: "general" },
        secretRefs: { bot: "secret://bot" },
      },
      runtimeRegistry: registry,
    });

    assert.equal(plan.status, "source_plan");
    assert.deepEqual(plan.runtime?.requestPlan, {
      method: "GET",
      endpoint: "messages",
      auth: [{ type: "secret", field: "bot", placement: "bearer" }],
      query: { channel: "general" },
      body: {},
      responseSchema: { type: "object" },
    });
    assert.deepEqual(plan.runtime?.sourcePlan, {
      delivery: "webhook",
      hooks: ["activate", "deactivate"],
      dedupe: "unique",
      eventsPath: "messages",
    });
  });

  it("fails closed when source execution is not ready for the control plane", async () => {
    await assert.rejects(
      runConnectorSource({
        catalog: fixtureCatalog(),
        operationId: "chat_service.source.new-message",
        dryRun: false,
        input: {
          values: { channel: "general" },
          secretRefs: { bot: "secret://bot" },
        },
        executor: {
          async start() {
            throw new Error("source executor must not receive plaintext secrets");
          },
        },
        controlPlane: fixtureControlPlane(),
      }),
      /not ready for control plane execution: unsupported_operation, missing_execution_policy, missing_audit_policy/,
    );
  });

  it("builds blocked and ready source subscriptions from plans", async () => {
    const blockedPlan = await runConnectorSource({
      catalog: fixtureCatalog(),
      operationId: "chat_service.source.new-message",
      input: { values: { channel: "general" } },
    });
    assert.equal(blockedPlan.status, "source_plan");
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
    assert.equal(readyPlan.status, "source_plan");
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
    assert.equal(plan.status, "source_plan");
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

function fixtureControlPlane() {
  return {
    capabilityId: "messages.send.text",
    context: {
      actorId: "agent_test",
      purpose: "fixture connector execution",
      requestId: "req_test",
    },
    policy: {
      id: "fixture_policy",
      enabled: true,
      defaultEffect: "allow" as const,
      requireContext: true,
      blockUnsupported: true,
      blockMissingCredentialBinding: true,
      rules: [],
      traceMode: "redacted" as const,
    },
    credentialBinding: {
      id: "binding_chat_service",
      providerId: "chat_service",
      secretRef: "secret://bot",
      credentialKind: "api_key" as const,
      capabilityIds: ["messages.send.text"],
      enabled: true,
    },
  };
}
