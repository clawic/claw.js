import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeConnectorCatalog } from "./catalog.ts";
import {
  buildNotionOperationRequest,
} from "./notion-operation-executor.ts";

const NOTION_CATALOG = normalizeConnectorCatalog({
  version: 1,
  apps: [{
    id: "notion",
    name: "Notion",
    authFieldNames: ["notionToken"],
    fields: [{
      name: "notionToken",
      type: "app",
      optional: false,
      secret: true,
    }],
    operations: [
      {
        id: "notion.action.search",
        appId: "notion",
        kind: "action",
        name: "Search",
        fields: [
          { name: "query", type: "string", optional: true },
          { name: "pageSize", type: "integer", optional: true, default: 10, min: 1 },
        ],
        authFieldNames: ["notionToken"],
      },
      {
        id: "notion.action.get-page",
        appId: "notion",
        kind: "action",
        name: "Get Page",
        fields: [
          { name: "pageId", type: "string", optional: false },
        ],
        authFieldNames: ["notionToken"],
      },
      {
        id: "notion.action.create-page",
        appId: "notion",
        kind: "action",
        name: "Create Page",
        fields: [
          { name: "parentPageId", type: "string", optional: false },
          { name: "title", type: "string", optional: false },
          { name: "markdown", type: "string", optional: true },
        ],
        authFieldNames: ["notionToken"],
      },
      {
        id: "notion.action.update-page",
        appId: "notion",
        kind: "action",
        name: "Update Page",
        fields: [
          { name: "pageId", type: "string", optional: false },
          { name: "title", type: "string", optional: true },
          { name: "archived", type: "boolean", optional: true },
        ],
        authFieldNames: ["notionToken"],
      },
      {
        id: "notion.action.query-data-source",
        appId: "notion",
        kind: "action",
        name: "Query Data Source",
        fields: [
          { name: "dataSourceId", type: "string", optional: false },
          { name: "pageSize", type: "integer", optional: true, default: 10, min: 1 },
        ],
        authFieldNames: ["notionToken"],
      },
    ],
  }],
});

describe("notion operation runtime", () => {
  it("builds Notion search, page, and data source request plans", () => {
    const auth = [{ type: "secret" as const, field: "notionToken", placement: "bearer" as const }];
    const headers = {
      accept: "application/json",
      "notion-version": "2026-03-11",
    };

    assert.deepEqual(buildNotionOperationRequest(operation("notion.action.search"), {
      query: "roadmap",
      pageSize: 10,
    }), {
      method: "POST",
      endpoint: "search",
      auth,
      headers,
      body: {
        query: "roadmap",
        page_size: 10,
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["object", "results"],
      },
    });

    assert.deepEqual(buildNotionOperationRequest(operation("notion.action.get-page"), { pageId: "page-sample" }), {
      method: "GET",
      endpoint: "pages/page-sample",
      auth,
      headers,
      body: {},
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "object"],
      },
    });

    assert.deepEqual(buildNotionOperationRequest(operation("notion.action.create-page"), {
      parentPageId: "parent-sample",
      title: "Draft",
      markdown: "# Draft",
    }), {
      method: "POST",
      endpoint: "pages",
      auth,
      headers,
      body: {
        parent: { page_id: "parent-sample" },
        properties: {
          title: {
            title: [{
              text: { content: "Draft" },
            }],
          },
        },
        markdown: "# Draft",
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "object"],
      },
    });

    assert.deepEqual(buildNotionOperationRequest(operation("notion.action.update-page"), {
      pageId: "page-sample",
      title: "Updated",
      archived: false,
    }), {
      method: "PATCH",
      endpoint: "pages/page-sample",
      auth,
      headers,
      body: {
        archived: false,
        properties: {
          title: {
            title: [{
              text: { content: "Updated" },
            }],
          },
        },
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "object"],
      },
    });

    assert.deepEqual(buildNotionOperationRequest(operation("notion.action.query-data-source"), {
      dataSourceId: "data-source-sample",
      pageSize: 10,
    }), {
      method: "POST",
      endpoint: "data_sources/data-source-sample/query",
      auth,
      headers,
      body: {
        page_size: 10,
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["object", "results"],
      },
    });
  });
});

function operation(operationId: string) {
  const found = NOTION_CATALOG.apps[0]?.operations.find((candidate) => candidate.id === operationId);
  assert.ok(found);
  return found;
}
