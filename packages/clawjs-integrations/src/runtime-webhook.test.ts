import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeConnectorCatalog } from "./catalog.ts";
import type { ConnectorRuntimeImplementation } from "./runtime-registry.ts";
import { handleConnectorRuntimeWebhook } from "./runtime-webhook.ts";

describe("connector runtime webhooks", () => {
  it("extracts source events from registered webhook runtime plans", () => {
    const catalog = normalizeConnectorCatalog({
      version: 1,
      apps: [{
        id: "fixture_service",
        name: "Fixture Service",
        authFieldNames: [],
        fields: [],
        operations: [{
          id: "fixture_service.source.new-records",
          appId: "fixture_service",
          kind: "source",
          name: "New Records",
          fields: [{ name: "topic", type: "string", optional: true }],
          authFieldNames: [],
          runtime: {
            hasRun: true,
            hasHooks: true,
            hookNames: ["activate", "deactivate"],
            hasAdditionalProps: false,
            hasMethods: false,
            methodNames: [],
            dedupe: "unique",
          },
          source: {
            delivery: "webhook",
            usesTimer: false,
            usesHttp: true,
            usesServiceDb: true,
          },
        }],
      }],
    });
    const registry: ConnectorRuntimeImplementation[] = [{
      appId: "fixture_service",
      kind: "source",
      executorId: "fixture.source.webhook",
      offlineValidated: true,
      evidence: ["packages/clawjs-integrations/src/runtime-webhook.test.ts"],
      fixtures: [{
        kind: "source_event",
        path: "packages/clawjs-integrations/fixtures/fixture-action-response.json",
      }],
      planKinds: ["source"],
      supports: (operation) => operation.id === "fixture_service.source.new-records",
      buildPlan: (operation) => ({
        sourcePlan: {
          delivery: operation.source?.delivery ?? "manual",
          hooks: operation.runtime?.hookNames ?? [],
          dedupe: operation.runtime?.dedupe,
          eventsPath: "payload.records",
          nextCursorPath: "paging.next",
        },
      }),
    }];
    const operation = catalog.apps[0]?.operations[0];
    assert.ok(operation);

    const result = handleConnectorRuntimeWebhook({
      operation,
      registry,
      payload: {
        payload: {
          records: [{ id: "evt_1" }, { id: "evt_2" }],
        },
        paging: {
          next: "cursor_2",
        },
      },
    });

    assert.deepEqual(result, {
      operationId: "fixture_service.source.new-records",
      appId: "fixture_service",
      executorId: "fixture.source.webhook",
      delivery: "webhook",
      events: [{ id: "evt_1" }, { id: "evt_2" }],
      nextCursor: "cursor_2",
    });
  });

  it("rejects non-webhook source deliveries", () => {
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
      executorId: "fixture.source.polling",
      offlineValidated: true,
      evidence: ["packages/clawjs-integrations/src/runtime-webhook.test.ts"],
      fixtures: [{
        kind: "source_event",
        path: "packages/clawjs-integrations/fixtures/fixture-action-response.json",
      }],
      planKinds: ["source"],
      supports: (operation) => operation.id === "fixture_service.source.poll",
      buildPlan: (operation) => ({
        sourcePlan: {
          delivery: operation.source?.delivery ?? "manual",
          hooks: [],
        },
      }),
    }];
    const operation = catalog.apps[0]?.operations[0];
    assert.ok(operation);

    assert.throws(
      () => handleConnectorRuntimeWebhook({ operation, registry, payload: {} }),
      /requires webhook or hybrid delivery/,
    );
  });
});
