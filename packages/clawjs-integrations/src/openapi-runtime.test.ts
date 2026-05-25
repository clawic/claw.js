import assert from "node:assert/strict";
import { describe, it } from "vitest";

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

  it("fails closed when an OpenAPI path parameter is missing", () => {
    const options = {
      appId: "fixture_commerce",
      authFieldName: "apiKey",
      evidence: ["packages/clawjs-integrations/src/openapi-runtime.test.ts"],
      fixtures: [],
    };
    const catalog = buildOpenApiConnectorCatalog(FIXTURE_OPENAPI, options);
    const registry = [createOpenApiConnectorRuntimeImplementation(FIXTURE_OPENAPI, options)];
    const operation = catalog.apps[0]?.operations.find((candidate) => candidate.id.endsWith("list-customer-items"));
    assert.ok(operation);

    assert.throws(
      () => buildConnectorOperationRuntimePlan(operation, {
        limit: 10,
      }, { registry }),
      /missing path parameter customerId/,
    );
  });

  it("preserves form body encoding from OpenAPI request bodies", () => {
    const document = {
      ...FIXTURE_OPENAPI,
      paths: {
        "/oauth/token": {
          post: {
            operationId: "createToken",
            summary: "Create token",
            requestBody: {
              content: {
                "application/x-www-form-urlencoded": {
                  schema: {
                    type: "object",
                    required: ["grant_type"],
                    properties: {
                      grant_type: { type: "string" },
                      scope: { type: "string" },
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
                      required: ["access_token"],
                      properties: {
                        access_token: { type: "string" },
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
    const options = {
      appId: "fixture_forms",
      authFieldName: "clientSecret",
      evidence: ["packages/clawjs-integrations/src/openapi-runtime.test.ts"],
      fixtures: [],
    };
    const catalog = buildOpenApiConnectorCatalog(document, options);
    const registry = [createOpenApiConnectorRuntimeImplementation(document, options)];
    const operation = catalog.apps[0]?.operations[0];
    assert.ok(operation);

    assert.deepEqual(operation.fields.map((field) => [field.name, field.optional]), [
      ["grant_type", false],
      ["scope", true],
    ]);
    assert.deepEqual(buildConnectorOperationRuntimePlan(operation, {
      grant_type: "client_credentials",
      scope: "items:read",
    }, { registry }).requestPlan, {
      method: "POST",
      endpoint: "/oauth/token",
      auth: [{ type: "secret", field: "clientSecret", placement: "bearer" }],
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: {
        grant_type: "client_credentials",
        scope: "items:read",
      },
      bodyEncoding: "form",
      responseSchema: {
        type: "object",
        requiredPaths: ["access_token"],
      },
    });
  });

  it("preserves multipart body encoding from OpenAPI request bodies", () => {
    const document = {
      ...FIXTURE_OPENAPI,
      paths: {
        "/files": {
          post: {
            operationId: "uploadFile",
            summary: "Upload file",
            requestBody: {
              content: {
                "multipart/form-data": {
                  schema: {
                    type: "object",
                    required: ["file_url"],
                    properties: {
                      file_url: {
                        type: "string",
                        description: "File URL.",
                      },
                      title: { type: "string" },
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
    const options = {
      appId: "fixture_multipart",
      authFieldName: "apiKey",
      evidence: ["packages/clawjs-integrations/src/openapi-runtime.test.ts"],
      fixtures: [],
    };
    const catalog = buildOpenApiConnectorCatalog(document, options);
    const registry = [createOpenApiConnectorRuntimeImplementation(document, options)];
    const operation = catalog.apps[0]?.operations[0];
    assert.ok(operation);

    assert.deepEqual(operation.fields.map((field) => [field.name, field.description ?? null, field.optional]), [
      ["file_url", "File URL.", false],
      ["title", null, true],
    ]);
    assert.deepEqual(buildConnectorOperationRuntimePlan(operation, {
      file_url: "https://example.invalid/file.txt",
      title: "demo",
    }, { registry }).requestPlan, {
      method: "POST",
      endpoint: "/files",
      auth: [{ type: "secret", field: "apiKey", placement: "bearer" }],
      headers: { accept: "application/json" },
      body: {
        file_url: "https://example.invalid/file.txt",
        title: "demo",
      },
      bodyEncoding: "multipart",
      responseSchema: {
        type: "object",
        requiredPaths: ["id"],
      },
    });
  });

  it("uses JSON suffix media types from OpenAPI content maps", () => {
    const document = {
      ...FIXTURE_OPENAPI,
      paths: {
        "/items": {
          post: {
            operationId: "createVendorItem",
            summary: "Create vendor item",
            requestBody: {
              content: {
                "application/vnd.fixture.item+json": {
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
                  "application/vnd.fixture.item+json": {
                    schema: {
                      type: "object",
                      required: ["id"],
                      properties: {
                        id: { type: "string" },
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
    const options = {
      appId: "fixture_vendor_json",
      authFieldName: "apiKey",
      evidence: ["packages/clawjs-integrations/src/openapi-runtime.test.ts"],
      fixtures: [],
    };
    const catalog = buildOpenApiConnectorCatalog(document, options);
    const registry = [createOpenApiConnectorRuntimeImplementation(document, options)];
    const operation = catalog.apps[0]?.operations[0];
    assert.ok(operation);

    assert.deepEqual(operation.fields.map((field) => [field.name, field.description ?? null, field.optional]), [
      ["name", "Display name.", false],
    ]);
    assert.deepEqual(buildConnectorOperationRuntimePlan(operation, {
      name: "example",
    }, { registry }).requestPlan, {
      method: "POST",
      endpoint: "/items",
      auth: [{ type: "secret", field: "apiKey", placement: "bearer" }],
      headers: {
        accept: "application/vnd.fixture.item+json",
        "content-type": "application/vnd.fixture.item+json",
      },
      body: { name: "example" },
      responseSchema: {
        type: "object",
        requiredPaths: ["id"],
      },
    });
  });

  it("maps whole OpenAPI request bodies when the schema has no object properties", () => {
    const document = {
      ...FIXTURE_OPENAPI,
      paths: {
        "/batches": {
          post: {
            operationId: "createBatch",
            summary: "Create batch",
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
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
                      required: ["ok"],
                      properties: {
                        ok: { type: "boolean" },
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
    const options = {
      appId: "fixture_whole_body",
      authFieldName: "apiKey",
      evidence: ["packages/clawjs-integrations/src/openapi-runtime.test.ts"],
      fixtures: [],
    };
    const catalog = buildOpenApiConnectorCatalog(document, options);
    const registry = [createOpenApiConnectorRuntimeImplementation(document, options)];
    const operation = catalog.apps[0]?.operations[0];
    assert.ok(operation);

    assert.deepEqual(operation.fields.map((field) => [field.name, field.type, field.optional]), [
      ["body", "array", false],
    ]);
    assert.deepEqual(buildConnectorOperationRuntimePlan(operation, {
      body: [{ name: "one" }, { name: "two" }],
    }, { registry }).requestPlan, {
      method: "POST",
      endpoint: "/batches",
      auth: [{ type: "secret", field: "apiKey", placement: "bearer" }],
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: {},
      bodyValue: [{ name: "one" }, { name: "two" }],
      responseSchema: {
        type: "object",
        requiredPaths: ["ok"],
      },
    });
  });

  it("preserves OpenAPI query serialization hints", () => {
    const document = {
      ...FIXTURE_OPENAPI,
      paths: {
        "/items/search": {
          get: {
            operationId: "searchItems",
            summary: "Search items",
            parameters: [
              {
                name: "ids",
                in: "query",
                style: "form",
                explode: false,
                schema: {
                  type: "array",
                  items: { type: "string" },
                },
              },
              {
                name: "filter",
                in: "query",
                style: "deepObject",
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string" },
                  },
                },
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
                          items: { type: "object" },
                        },
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
    const options = {
      appId: "fixture_query_serialization",
      authFieldName: "apiKey",
      evidence: ["packages/clawjs-integrations/src/openapi-runtime.test.ts"],
      fixtures: [],
    };
    const catalog = buildOpenApiConnectorCatalog(document, options);
    const registry = [createOpenApiConnectorRuntimeImplementation(document, options)];
    const operation = catalog.apps[0]?.operations[0];
    assert.ok(operation);

    assert.deepEqual(buildConnectorOperationRuntimePlan(operation, {
      ids: ["one", "two"],
      filter: { status: "active" },
    }, { registry }).requestPlan, {
      method: "GET",
      endpoint: "/items/search",
      auth: [{ type: "secret", field: "apiKey", placement: "bearer" }],
      headers: { accept: "application/json" },
      query: {
        ids: ["one", "two"],
        filter: { status: "active" },
      },
      querySerialization: {
        ids: { style: "form", explode: false },
        filter: { style: "deepObject" },
      },
      body: {},
      responseSchema: {
        type: "object",
        requiredPaths: ["data"],
      },
    });
  });

  it("uses default values for OpenAPI server variables", () => {
    const document = {
      ...FIXTURE_OPENAPI,
      servers: [{
        url: "https://{environment}.api.example.invalid/{version}/",
        variables: {
          environment: { default: "sandbox" },
          version: { default: "v2" },
        },
      }],
    };
    const options = {
      appId: "fixture_server_variables",
      authFieldName: "apiKey",
      evidence: ["packages/clawjs-integrations/src/openapi-runtime.test.ts"],
      fixtures: [],
    };
    const implementation = createOpenApiConnectorRuntimeImplementation(document, options);

    assert.equal(implementation.baseUrl, "https://sandbox.api.example.invalid/v2/");
  });

  it("uses path and operation OpenAPI servers for request plans", () => {
    const document = {
      ...FIXTURE_OPENAPI,
      servers: [{ url: "https://api.example.invalid/v1/" }],
      paths: {
        "/accounts/{accountId}": {
          servers: [{ url: "https://accounts.example.invalid/{version}/", variables: { version: { default: "v2" } } }],
          get: {
            operationId: "getAccount",
            summary: "Get account",
            parameters: [{
              name: "accountId",
              in: "path",
              required: true,
              schema: { type: "string" },
            }],
            responses: {
              "200": {
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      required: ["id"],
                      properties: {
                        id: { type: "string" },
                      },
                    },
                  },
                },
              },
            },
          },
          post: {
            operationId: "updateAccount",
            summary: "Update account",
            servers: [{ url: "https://write.example.invalid/" }],
            parameters: [{
              name: "accountId",
              in: "path",
              required: true,
              schema: { type: "string" },
            }],
            responses: {
              "200": {
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      required: ["id"],
                      properties: {
                        id: { type: "string" },
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
    const options = {
      appId: "fixture_operation_servers",
      authFieldName: "apiKey",
      evidence: ["packages/clawjs-integrations/src/openapi-runtime.test.ts"],
      fixtures: [],
    };
    const catalog = buildOpenApiConnectorCatalog(document, options);
    const registry = [createOpenApiConnectorRuntimeImplementation(document, options)];
    const getOperation = catalog.apps[0]?.operations.find((operation) => operation.id.endsWith("get-account"));
    const updateOperation = catalog.apps[0]?.operations.find((operation) => operation.id.endsWith("update-account"));
    assert.ok(getOperation);
    assert.ok(updateOperation);

    assert.equal(buildConnectorOperationRuntimePlan(getOperation, {
      accountId: "acct_123",
    }, { registry }).requestPlan?.url, "https://accounts.example.invalid/v2/accounts/acct_123");
    assert.equal(buildConnectorOperationRuntimePlan(updateOperation, {
      accountId: "acct_123",
    }, { registry }).requestPlan?.url, "https://write.example.invalid/accounts/acct_123");
  });

  it("maps OpenAPI cookie parameters to request headers", () => {
    const document = {
      ...FIXTURE_OPENAPI,
      paths: {
        "/items": {
          get: {
            operationId: "listItemsWithCookie",
            summary: "List items with cookie",
            parameters: [
              {
                name: "session_id",
                in: "cookie",
                required: true,
                schema: { type: "string" },
              },
              {
                name: "workspace",
                in: "cookie",
                schema: { type: "string" },
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
                          items: { type: "object" },
                        },
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
    const options = {
      appId: "fixture_cookie_parameters",
      authFieldName: "apiKey",
      evidence: ["packages/clawjs-integrations/src/openapi-runtime.test.ts"],
      fixtures: [],
    };
    const catalog = buildOpenApiConnectorCatalog(document, options);
    const registry = [createOpenApiConnectorRuntimeImplementation(document, options)];
    const operation = catalog.apps[0]?.operations[0];
    assert.ok(operation);

    assert.deepEqual(operation.fields.map((field) => [field.name, field.optional]), [
      ["session_id", false],
      ["workspace", true],
    ]);
    assert.deepEqual(buildConnectorOperationRuntimePlan(operation, {
      session_id: "session 123",
      workspace: "main",
    }, { registry }).requestPlan?.headers, {
      accept: "application/json",
      cookie: "session_id=session%20123; workspace=main",
    });
  });

  it("merges OpenAPI allOf schema fields", () => {
    const document = {
      openapi: "3.0.0",
      info: {
        title: "Fixture Composed Schemas",
        version: "2026-05-12",
      },
      servers: [{ url: "https://api.example.invalid/v1/" }],
      components: {
        schemas: {
          createBase: {
            type: "object",
            required: ["name"],
            properties: {
              name: {
                type: "string",
                description: "Display name.",
              },
            },
          },
          createExtra: {
            type: "object",
            required: ["external_id"],
            properties: {
              external_id: { type: "string" },
            },
          },
          itemBase: {
            type: "object",
            required: ["id"],
            properties: {
              id: { type: "string" },
            },
          },
        },
      },
      paths: {
        "/items": {
          post: {
            operationId: "createItem",
            summary: "Create item",
            requestBody: {
              content: {
                "application/json": {
                  schema: {
                    allOf: [
                      { $ref: "#/components/schemas/createBase" },
                      { $ref: "#/components/schemas/createExtra" },
                    ],
                  },
                },
              },
            },
            responses: {
              "200": {
                content: {
                  "application/json": {
                    schema: {
                      allOf: [
                        { $ref: "#/components/schemas/itemBase" },
                        {
                          type: "object",
                          required: ["name"],
                          properties: {
                            name: { type: "string" },
                          },
                        },
                      ],
                    },
                  },
                },
              },
            },
          },
        },
      },
    };
    const options = {
      appId: "fixture_composed",
      authFieldName: "apiKey",
      evidence: ["packages/clawjs-integrations/src/openapi-runtime.test.ts"],
      fixtures: [],
    };
    const catalog = buildOpenApiConnectorCatalog(document, options);
    const registry = [createOpenApiConnectorRuntimeImplementation(document, options)];
    const operation = catalog.apps[0]?.operations[0];
    assert.ok(operation);

    assert.deepEqual(operation.fields.map((field) => [field.name, field.description ?? null, field.optional]), [
      ["external_id", null, false],
      ["name", "Display name.", false],
    ]);
    assert.deepEqual(buildConnectorOperationRuntimePlan(operation, {
      external_id: "ext_123",
      name: "example",
    }, { registry }).requestPlan?.responseSchema, {
      type: "object",
      requiredPaths: ["id", "name"],
    });
  });

  it("derives nested OpenAPI response required paths", () => {
    const document = {
      openapi: "3.0.0",
      info: {
        title: "Fixture Nested Outputs",
        version: "2026-05-12",
      },
      servers: [{ url: "https://api.example.invalid/v1/" }],
      components: {
        schemas: {
          owner: {
            type: "object",
            required: ["id"],
            properties: {
              id: { type: "string" },
            },
          },
        },
      },
      paths: {
        "/items/{itemId}": {
          get: {
            operationId: "getItem",
            summary: "Get item",
            parameters: [{
              name: "itemId",
              in: "path",
              required: true,
              schema: { type: "string" },
            }],
            responses: {
              "200": {
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      required: ["id", "owner"],
                      properties: {
                        id: { type: "string" },
                        owner: { $ref: "#/components/schemas/owner" },
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
    const options = {
      appId: "fixture_nested_outputs",
      authFieldName: "apiKey",
      evidence: ["packages/clawjs-integrations/src/openapi-runtime.test.ts"],
      fixtures: [],
    };
    const catalog = buildOpenApiConnectorCatalog(document, options);
    const registry = [createOpenApiConnectorRuntimeImplementation(document, options)];
    const operation = catalog.apps[0]?.operations[0];
    assert.ok(operation);

    assert.deepEqual(buildConnectorOperationRuntimePlan(operation, {
      itemId: "item_123",
    }, { registry }).requestPlan?.responseSchema, {
      type: "object",
      requiredPaths: ["id", "owner", "owner.id"],
    });
  });

  it("normalizes nullable and union OpenAPI schema types", () => {
    const document = {
      openapi: "3.1.0",
      info: {
        title: "Fixture Nullable Schemas",
        version: "2026-05-12",
      },
      servers: [{ url: "https://api.example.invalid/v1/" }],
      paths: {
        "/items": {
          get: {
            operationId: "listNullableItems",
            summary: "List nullable items",
            parameters: [
              {
                name: "cursor",
                in: "query",
                schema: { type: ["string", "null"] },
              },
              {
                name: "limit",
                in: "query",
                schema: { type: ["integer", "null"] },
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
                          type: ["array", "null"],
                          items: { type: "object" },
                        },
                        next_cursor: {
                          type: ["string", "null"],
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          post: {
            operationId: "createNullableItem",
            summary: "Create nullable item",
            requestBody: {
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["name", "active"],
                    properties: {
                      name: {
                        type: ["string", "null"],
                        description: "Display name.",
                      },
                      active: {
                        type: "boolean",
                        nullable: true,
                      },
                      metadata: {
                        type: ["object", "null"],
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
                      type: ["object", "null"],
                      required: ["id"],
                      properties: {
                        id: { type: ["string", "null"] },
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
    const options = {
      appId: "fixture_nullable",
      authFieldName: "apiKey",
      evidence: ["packages/clawjs-integrations/src/openapi-runtime.test.ts"],
      fixtures: [],
    };
    const catalog = buildOpenApiConnectorCatalog(document, options);
    const registry = [createOpenApiConnectorRuntimeImplementation(document, options)];
    const listOperation = catalog.apps[0]?.operations.find((operation) => operation.id.endsWith("list-nullable-items"));
    const createOperation = catalog.apps[0]?.operations.find((operation) => operation.id.endsWith("create-nullable-item"));
    assert.ok(listOperation);
    assert.ok(createOperation);

    assert.deepEqual(listOperation.fields.map((field) => [field.name, field.type, field.optional]), [
      ["cursor", "string", true],
      ["limit", "integer", true],
    ]);
    assert.deepEqual(buildConnectorOperationRuntimePlan(listOperation, {
      limit: 10,
    }, { registry }).requestPlan?.pagination, {
      mode: "cursor",
      itemsPath: "data",
      cursorParam: "cursor",
      nextCursorPath: "next_cursor",
      limitParam: "limit",
    });
    assert.deepEqual(createOperation.fields.map((field) => [field.name, field.type, field.description ?? null, field.optional]), [
      ["active", "boolean", null, false],
      ["metadata", "object", null, true],
      ["name", "string", "Display name.", false],
    ]);
    assert.deepEqual(buildConnectorOperationRuntimePlan(createOperation, {
      active: true,
      name: "example",
    }, { registry }).requestPlan?.responseSchema, {
      type: "object",
      requiredPaths: ["id"],
    });
  });

  it("honors OpenAPI readOnly and writeOnly schema properties", () => {
    const document = {
      openapi: "3.0.0",
      info: {
        title: "Fixture Access Schemas",
        version: "2026-05-12",
      },
      servers: [{ url: "https://api.example.invalid/v1/" }],
      paths: {
        "/tokens": {
          post: {
            operationId: "createToken",
            summary: "Create token",
            requestBody: {
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["id", "name", "secret"],
                    properties: {
                      id: {
                        type: "string",
                        readOnly: true,
                      },
                      name: {
                        type: "string",
                      },
                      secret: {
                        type: "string",
                        writeOnly: true,
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
                      required: ["id", "secret"],
                      properties: {
                        id: { type: "string" },
                        secret: {
                          type: "string",
                          writeOnly: true,
                        },
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
    const options = {
      appId: "fixture_access_modes",
      authFieldName: "apiKey",
      evidence: ["packages/clawjs-integrations/src/openapi-runtime.test.ts"],
      fixtures: [],
    };
    const catalog = buildOpenApiConnectorCatalog(document, options);
    const registry = [createOpenApiConnectorRuntimeImplementation(document, options)];
    const operation = catalog.apps[0]?.operations[0];
    assert.ok(operation);

    assert.deepEqual(operation.fields.map((field) => [field.name, field.optional]), [
      ["name", false],
      ["secret", false],
    ]);
    assert.deepEqual(buildConnectorOperationRuntimePlan(operation, {
      name: "example",
      secret: "fixture",
    }, { registry }).requestPlan, {
      method: "POST",
      endpoint: "/tokens",
      auth: [{ type: "secret", field: "apiKey", placement: "bearer" }],
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: {
        name: "example",
        secret: "fixture",
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id"],
      },
    });
  });

  it("merges OpenAPI oneOf schema fields conservatively", () => {
    const document = {
      openapi: "3.0.0",
      info: {
        title: "Fixture Alternative Schemas",
        version: "2026-05-12",
      },
      servers: [{ url: "https://api.example.invalid/v1/" }],
      paths: {
        "/contacts": {
          post: {
            operationId: "createContact",
            summary: "Create contact",
            requestBody: {
              content: {
                "application/json": {
                  schema: {
                    oneOf: [
                      {
                        type: "object",
                        required: ["email"],
                        properties: {
                          email: {
                            type: "string",
                            description: "Email address.",
                          },
                        },
                      },
                      {
                        type: "object",
                        required: ["phone"],
                        properties: {
                          phone: {
                            type: "string",
                            description: "Phone number.",
                          },
                        },
                      },
                    ],
                  },
                },
              },
            },
            responses: {
              "200": {
                content: {
                  "application/json": {
                    schema: {
                      oneOf: [
                        {
                          type: "object",
                          required: ["id", "email"],
                          properties: {
                            id: { type: "string" },
                            email: { type: "string" },
                          },
                        },
                        {
                          type: "object",
                          required: ["id", "phone"],
                          properties: {
                            id: { type: "string" },
                            phone: { type: "string" },
                          },
                        },
                      ],
                    },
                  },
                },
              },
            },
          },
        },
      },
    };
    const options = {
      appId: "fixture_alternatives",
      authFieldName: "apiKey",
      evidence: ["packages/clawjs-integrations/src/openapi-runtime.test.ts"],
      fixtures: [],
    };
    const catalog = buildOpenApiConnectorCatalog(document, options);
    const registry = [createOpenApiConnectorRuntimeImplementation(document, options)];
    const operation = catalog.apps[0]?.operations[0];
    assert.ok(operation);

    assert.deepEqual(operation.fields.map((field) => [field.name, field.description ?? null, field.optional]), [
      ["email", "Email address.", true],
      ["phone", "Phone number.", true],
    ]);
    assert.deepEqual(buildConnectorOperationRuntimePlan(operation, {
      email: "person@example.invalid",
    }, { registry }).requestPlan?.responseSchema, {
      type: "object",
      requiredPaths: ["id"],
    });
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

  it("uses one OpenAPI security requirement alternative instead of merging all alternatives", () => {
    const document = {
      ...FIXTURE_OPENAPI,
      components: {
        securitySchemes: {
          apiKey: {
            type: "apiKey",
            in: "header",
            name: "x-api-key",
          },
          oauthToken: {
            type: "oauth2",
            flows: {
              clientCredentials: {
                tokenUrl: "https://api.example.invalid/oauth/token",
                scopes: {},
              },
            },
          },
        },
      },
      security: [{ apiKey: [] }, { oauthToken: [] }],
    };
    const options = {
      appId: "fixture_auth_alternatives",
      evidence: ["packages/clawjs-integrations/src/openapi-runtime.test.ts"],
      fixtures: [],
    };
    const catalog = buildOpenApiConnectorCatalog(document, options);
    const registry = [createOpenApiConnectorRuntimeImplementation(document, options)];
    const operation = catalog.apps[0]?.operations.find((candidate) => candidate.id.endsWith("list-customer-items"));
    assert.ok(operation);

    assert.deepEqual(catalog.apps[0]?.authFieldNames, ["apiKey"]);
    assert.deepEqual(buildConnectorOperationRuntimePlan(operation, {
      customerId: "cus_123",
    }, { registry }).requestPlan?.auth, [{
      type: "secret",
      field: "apiKey",
      placement: "header",
      name: "x-api-key",
    }]);
  });

  it("honors anonymous OpenAPI security alternatives", () => {
    const document = {
      ...FIXTURE_OPENAPI,
      components: {
        securitySchemes: {
          apiKey: {
            type: "apiKey",
            in: "header",
            name: "x-api-key",
          },
        },
      },
      security: [{}, { apiKey: [] }],
    };
    const options = {
      appId: "fixture_anonymous_auth",
      evidence: ["packages/clawjs-integrations/src/openapi-runtime.test.ts"],
      fixtures: [],
    };
    const catalog = buildOpenApiConnectorCatalog(document, options);
    const registry = [createOpenApiConnectorRuntimeImplementation(document, options)];
    const operation = catalog.apps[0]?.operations.find((candidate) => candidate.id.endsWith("list-customer-items"));
    assert.ok(operation);

    assert.deepEqual(catalog.apps[0]?.authFieldNames, []);
    assert.deepEqual(buildConnectorOperationRuntimePlan(operation, {
      customerId: "cus_123",
    }, { registry }).requestPlan?.auth, []);
  });

  it("infers cookie api key bindings from OpenAPI security schemes", () => {
    const document = {
      ...FIXTURE_OPENAPI,
      components: {
        securitySchemes: {
          sessionCookie: {
            type: "apiKey",
            in: "cookie",
            name: "session_id",
            description: "Fixture session cookie.",
          },
        },
      },
      security: [{ sessionCookie: [] }],
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

    assert.deepEqual(catalog.apps[0]?.fields, [{
      name: "sessionCookie",
      type: "string",
      optional: false,
      secret: true,
      description: "Fixture session cookie.",
    }]);
    assert.deepEqual(buildConnectorOperationRuntimePlan(operation, {
      customerId: "cus_123",
      limit: 10,
    }, { registry }).requestPlan?.auth, [{
      type: "secret",
      field: "sessionCookie",
      placement: "cookie",
      name: "session_id",
    }]);
  });

  it("infers basic auth bindings from OpenAPI security schemes", () => {
    const document = {
      ...FIXTURE_OPENAPI,
      components: {
        securitySchemes: {
          basicAuth: {
            type: "http",
            scheme: "basic",
            description: "Fixture basic credential.",
          },
        },
      },
      security: [{ basicAuth: [] }],
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

    assert.deepEqual(catalog.apps[0]?.fields, [{
      name: "basicAuth",
      type: "string",
      optional: false,
      secret: true,
      description: "Fixture basic credential.",
    }]);
    assert.deepEqual(buildConnectorOperationRuntimePlan(operation, {
      customerId: "cus_123",
      limit: 10,
    }, { registry }).requestPlan?.auth, [{
      type: "secret",
      field: "basicAuth",
      placement: "header",
      name: "authorization",
      prefix: "Basic ",
    }]);
  });

  it("infers OAuth bearer bindings from OpenAPI security schemes", () => {
    const document = {
      ...FIXTURE_OPENAPI,
      components: {
        securitySchemes: {
          oauthToken: {
            type: "oauth2",
            description: "Fixture OAuth access token.",
            flows: {
              clientCredentials: {
                tokenUrl: "https://api.example.invalid/oauth/token",
                scopes: {},
              },
            },
          },
        },
      },
      security: [{ oauthToken: [] }],
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

    assert.deepEqual(catalog.apps[0]?.fields, [{
      name: "oauthToken",
      type: "string",
      optional: false,
      secret: true,
      description: "Fixture OAuth access token.",
    }]);
    assert.deepEqual(buildConnectorOperationRuntimePlan(operation, {
      customerId: "cus_123",
      limit: 10,
    }, { registry }).requestPlan?.auth, [{
      type: "secret",
      field: "oauthToken",
      placement: "bearer",
    }]);
  });

  it("resolves local OpenAPI component refs", () => {
    const document = {
      openapi: "3.0.0",
      info: {
        title: "Fixture Ref Commerce",
        version: "2026-05-12",
      },
      servers: [{ url: "https://api.example.invalid/v1/" }],
      components: {
        securitySchemes: {
          bearerAuth: {
            $ref: "#/components/securitySchemes/bearerToken",
          },
          bearerToken: {
            type: "http",
            scheme: "bearer",
          },
        },
        parameters: {
          customerId: {
            name: "customerId",
            in: "path",
            required: true,
            schema: { $ref: "#/components/schemas/customerId" },
          },
        },
        requestBodies: {
          createItem: {
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/createItem" },
              },
            },
          },
        },
        responses: {
          item: {
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/item" },
              },
            },
          },
        },
        schemas: {
          customerId: {
            type: "string",
          },
          createItem: {
            type: "object",
            required: ["name"],
            properties: {
              name: {
                $ref: "#/components/schemas/itemName",
              },
            },
          },
          itemName: {
            type: "string",
            description: "Display name.",
          },
          item: {
            type: "object",
            required: ["id"],
            properties: {
              id: { type: "string" },
            },
          },
        },
      },
      security: [{ bearerAuth: [] }],
      paths: {
        "/customers/{customerId}/items": {
          post: {
            operationId: "createCustomerItem",
            summary: "Create customer item",
            parameters: [{ $ref: "#/components/parameters/customerId" }],
            requestBody: { $ref: "#/components/requestBodies/createItem" },
            responses: {
              "200": { $ref: "#/components/responses/item" },
            },
          },
        },
      },
    };
    const options = {
      appId: "fixture_refs",
      evidence: ["packages/clawjs-integrations/src/openapi-runtime.test.ts"],
      fixtures: [],
    };
    const catalog = buildOpenApiConnectorCatalog(document, options);
    const registry = createOpenApiConnectorRuntimeImplementations(document, options);
    const operation = catalog.apps[0]?.operations[0];
    assert.ok(operation);

    assert.deepEqual(catalog.apps[0]?.authFieldNames, ["bearerAuth"]);
    assert.deepEqual(operation.fields.map((field) => [field.name, field.type, field.description ?? null, field.optional]), [
      ["customerId", "string", null, false],
      ["name", "string", "Display name.", false],
    ]);
    assert.deepEqual(buildConnectorOperationRuntimePlan(operation, {
      customerId: "cus_123",
      name: "example",
    }, { registry }).requestPlan, {
      method: "POST",
      endpoint: "/customers/cus_123/items",
      auth: [{ type: "secret", field: "bearerAuth", placement: "bearer" }],
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: { name: "example" },
      responseSchema: {
        type: "object",
        requiredPaths: ["id"],
      },
    });
  });

  it("resolves local OpenAPI path item refs", () => {
    const document = {
      openapi: "3.0.0",
      info: {
        title: "Fixture Path Items",
        version: "2026-05-12",
      },
      servers: [{ url: "https://api.example.invalid/v1/" }],
      components: {
        pathItems: {
          item: {
            parameters: [{
              name: "customerId",
              in: "path",
              required: true,
              schema: { type: "string" },
            }],
            get: {
              operationId: "getCustomerItem",
              summary: "Get customer item",
              responses: {
                "200": {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        required: ["id"],
                        properties: {
                          id: { type: "string" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          itemEvents: {
            post: {
              operationId: "itemEvents",
              summary: "Item events",
              requestBody: {
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: {
                        events: {
                          type: "array",
                          items: { type: "object" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      paths: {
        "/customers/{customerId}/items/current": {
          $ref: "#/components/pathItems/item",
        },
      },
      webhooks: {
        itemEvents: {
          $ref: "#/components/pathItems/itemEvents",
        },
      },
    };
    const options = {
      appId: "fixture_path_items",
      authFieldName: "apiKey",
      evidence: ["packages/clawjs-integrations/src/openapi-runtime.test.ts"],
      fixtures: [],
    };
    const catalog = buildOpenApiConnectorCatalog(document, options);
    const registry = createOpenApiConnectorRuntimeImplementations(document, options);
    const action = catalog.apps[0]?.operations.find((operation) => operation.kind === "action");
    const source = catalog.apps[0]?.operations.find((operation) => operation.kind === "source");
    assert.ok(action);
    assert.ok(source);

    assert.deepEqual(action.fields.map((field) => [field.name, field.optional]), [["customerId", false]]);
    assert.deepEqual(buildConnectorOperationRuntimePlan(action, {
      customerId: "cus_123",
    }, { registry }).requestPlan?.endpoint, "/customers/cus_123/items/current");
    assert.deepEqual(buildConnectorOperationRuntimePlan(source, {}, { registry }).sourcePlan, {
      delivery: "webhook",
      hooks: [],
      eventsPath: "events",
    });
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
