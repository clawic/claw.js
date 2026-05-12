import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildOpenApiConnectorCatalog,
  createOpenApiConnectorRuntimeImplementations,
  createOpenApiConnectorRuntimeImplementation,
} from "./openapi-runtime.ts";
import {
  buildConnectorOperationRuntimePlan,
  verifyConnectorRuntimeCoverage,
  verifyConnectorRuntimeOfflineExecutions,
} from "./runtime-coverage.ts";
import { handleConnectorRuntimeWebhook } from "./runtime-webhook.ts";

const FIXTURE_OPENAPI = {
  openapi: "3.0.0",
  info: {
    title: "Fixture Commerce",
    description: "Fixture API used for offline runtime tests.",
    version: "2026-05-12",
  },
  servers: [{ url: "https://api.example.invalid/v1/" }],
  paths: {
    "/customers/{customerId}/items": {
      get: {
        operationId: "listCustomerItems",
        summary: "List customer items",
        parameters: [
          {
            name: "customerId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 100, default: 2 },
          },
          {
            name: "offset",
            in: "query",
            schema: { type: "integer", minimum: 0, default: 0 },
          },
        ],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["data"],
                  properties: {
                    data: {
                      type: "array",
                      items: {
                        type: "object",
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        operationId: "createCustomerItem",
        summary: "Create customer item",
        parameters: [
          {
            name: "customerId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name"],
                properties: {
                  name: {
                    type: "string",
                    description: "Display name.",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["id"],
                  properties: {
                    id: { type: "string" },
                    name: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

const FIXTURE_OPENAPI_WITH_WEBHOOK = {
  ...FIXTURE_OPENAPI,
  webhooks: {
    itemEvents: {
      post: {
        operationId: "itemEvents",
        summary: "Item events",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["events"],
                properties: {
                  events: {
                    type: "array",
                    items: {
                      type: "object",
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                },
              },
            },
          },
        },
      },
    },
  },
};

describe("OpenAPI connector runtime", () => {
  it("builds a connector catalog from OpenAPI operations", () => {
    const catalog = buildOpenApiConnectorCatalog(FIXTURE_OPENAPI, {
      appId: "fixture_commerce",
      authFieldName: "apiKey",
      evidence: ["packages/clawjs-integrations/src/openapi-runtime.test.ts"],
      fixtures: [],
    });

    assert.equal(catalog.apps[0]?.id, "fixture_commerce");
    assert.equal(catalog.apps[0]?.name, "Fixture Commerce");
    assert.deepEqual(catalog.apps[0]?.authFieldNames, ["apiKey"]);
    assert.deepEqual(catalog.apps[0]?.operations.map((operation) => operation.id), [
      "fixture_commerce.action.create-customer-item",
      "fixture_commerce.action.list-customer-items",
    ]);
    assert.deepEqual(catalog.apps[0]?.operations.find((operation) => operation.id.endsWith("list-customer-items"))?.fields.map((field) => field.name), [
      "customerId",
      "limit",
      "offset",
    ]);
    assert.deepEqual(catalog.apps[0]?.operations.find((operation) => operation.id.endsWith("create-customer-item"))?.fields.map((field) => field.name), [
      "customerId",
      "name",
    ]);
  });

  it("builds request plans and replays operation-scoped fixtures offline", async () => {
    const options = {
      appId: "fixture_commerce",
      authFieldName: "apiKey",
      evidence: ["packages/clawjs-integrations/src/openapi-runtime.test.ts"],
      fixtures: [
        {
          kind: "request" as const,
          operationId: "fixture_commerce.action.list-customer-items",
          path: "packages/clawjs-integrations/fixtures/openapi-list-items-request.json",
        },
        {
          kind: "response" as const,
          operationId: "fixture_commerce.action.list-customer-items",
          path: "packages/clawjs-integrations/fixtures/openapi-list-items-response.json",
        },
        {
          kind: "request" as const,
          operationId: "fixture_commerce.action.create-customer-item",
          path: "packages/clawjs-integrations/fixtures/openapi-create-item-request.json",
        },
        {
          kind: "response" as const,
          operationId: "fixture_commerce.action.create-customer-item",
          path: "packages/clawjs-integrations/fixtures/openapi-create-item-response.json",
        },
      ],
    };
    const catalog = buildOpenApiConnectorCatalog(FIXTURE_OPENAPI, options);
    const registry = [createOpenApiConnectorRuntimeImplementation(FIXTURE_OPENAPI, options)];

    const listOperation = catalog.apps[0]?.operations.find((operation) => operation.id.endsWith("list-customer-items"));
    assert.ok(listOperation);
    assert.deepEqual(buildConnectorOperationRuntimePlan(listOperation, {
      customerId: "cus_123",
      limit: 10,
    }, { registry }).requestPlan, {
      method: "GET",
      endpoint: "/customers/cus_123/items",
      auth: [{ type: "secret", field: "apiKey", placement: "bearer" }],
      headers: { accept: "application/json" },
      query: { limit: 10 },
      body: {},
      pagination: {
        mode: "offset",
        itemsPath: "data",
        limitParam: "limit",
        offsetParam: "offset",
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["data"],
      },
    });

    const coverage = verifyConnectorRuntimeCoverage(catalog, { registry });
    assert.equal(coverage.summary.implemented, 2);
    assert.equal(coverage.summary.missing, 0);

    const offline = await verifyConnectorRuntimeOfflineExecutions(catalog, { registry });
    assert.deepEqual(offline.results.map((result) => result.operationId), [
      "fixture_commerce.action.create-customer-item",
      "fixture_commerce.action.list-customer-items",
    ]);
    assert.deepEqual(offline.errors, []);
  });

  it("infers api key auth bindings from OpenAPI security schemes", () => {
    const document = {
      ...FIXTURE_OPENAPI,
      components: {
        securitySchemes: {
          apiKey: {
            type: "apiKey",
            in: "header",
            name: "x-api-key",
            description: "Fixture API key.",
          },
        },
      },
      security: [{ apiKey: [] }],
    };
    const options = {
      appId: "fixture_commerce",
      evidence: ["packages/clawjs-integrations/src/openapi-runtime.test.ts"],
      fixtures: [],
    };
    const catalog = buildOpenApiConnectorCatalog(document, options);
    const registry = [createOpenApiConnectorRuntimeImplementation(document, options)];
    const operation = catalog.apps[0]?.operations.find((candidate) => candidate.id.endsWith("list-customer-items"));
    assert.ok(operation);

    assert.deepEqual(catalog.apps[0]?.authFieldNames, ["apiKey"]);
    assert.deepEqual(catalog.apps[0]?.fields, [{
      name: "apiKey",
      type: "string",
      optional: false,
      secret: true,
      description: "Fixture API key.",
    }]);
    assert.deepEqual(buildConnectorOperationRuntimePlan(operation, {
      customerId: "cus_123",
      limit: 10,
    }, { registry }).requestPlan?.auth, [{
      type: "secret",
      field: "apiKey",
      placement: "header",
      name: "x-api-key",
    }]);
  });

  it("builds webhook sources from OpenAPI webhook operations", async () => {
    const options = {
      appId: "fixture_commerce",
      authFieldName: "apiKey",
      evidence: ["packages/clawjs-integrations/src/openapi-runtime.test.ts"],
      fixtures: [
        {
          kind: "request" as const,
          operationId: "fixture_commerce.action.list-customer-items",
          path: "packages/clawjs-integrations/fixtures/openapi-list-items-request.json",
        },
        {
          kind: "response" as const,
          operationId: "fixture_commerce.action.list-customer-items",
          path: "packages/clawjs-integrations/fixtures/openapi-list-items-response.json",
        },
        {
          kind: "request" as const,
          operationId: "fixture_commerce.action.create-customer-item",
          path: "packages/clawjs-integrations/fixtures/openapi-create-item-request.json",
        },
        {
          kind: "response" as const,
          operationId: "fixture_commerce.action.create-customer-item",
          path: "packages/clawjs-integrations/fixtures/openapi-create-item-response.json",
        },
        {
          kind: "source_event" as const,
          operationId: "fixture_commerce.source.item-events",
          path: "packages/clawjs-integrations/fixtures/openapi-webhook-event.json",
        },
      ],
    };
    const catalog = buildOpenApiConnectorCatalog(FIXTURE_OPENAPI_WITH_WEBHOOK, options);
    const registry = createOpenApiConnectorRuntimeImplementations(FIXTURE_OPENAPI_WITH_WEBHOOK, options);
    const operation = catalog.apps[0]?.operations.find((candidate) => candidate.id === "fixture_commerce.source.item-events");
    assert.ok(operation);

    assert.equal(operation.kind, "source");
    assert.deepEqual(operation.source, {
      delivery: "webhook",
      usesTimer: false,
      usesHttp: true,
      usesServiceDb: false,
    });
    assert.deepEqual(buildConnectorOperationRuntimePlan(operation, {}, { registry }).sourcePlan, {
      delivery: "webhook",
      hooks: [],
      eventsPath: "events",
    });

    const coverage = verifyConnectorRuntimeCoverage(catalog, { registry });
    assert.equal(coverage.summary.implemented, 3);
    assert.equal(coverage.summary.missing, 0);

    const offline = await verifyConnectorRuntimeOfflineExecutions(catalog, { registry });
    assert.deepEqual(offline.results.map((result) => result.operationId), [
      "fixture_commerce.action.create-customer-item",
      "fixture_commerce.source.item-events",
      "fixture_commerce.action.list-customer-items",
    ]);
    assert.deepEqual(handleConnectorRuntimeWebhook({
      operation,
      registry,
      payload: {
        events: [{ id: "evt_1" }],
      },
    }).events, [{ id: "evt_1" }]);
  });
});
