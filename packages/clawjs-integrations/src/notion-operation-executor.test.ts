import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeConnectorCatalog } from "./catalog.ts";
import {
  verifyConnectorRuntimeCoverage,
  verifyConnectorRuntimeOfflineExecutions,
} from "./runtime-coverage.ts";
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
        id: "notion.action.get-block",
        appId: "notion",
        kind: "action",
        name: "Get Block",
        fields: [
          { name: "blockId", type: "string", optional: false },
        ],
        authFieldNames: ["notionToken"],
      },
      {
        id: "notion.action.list-block-children",
        appId: "notion",
        kind: "action",
        name: "List Block Children",
        fields: [
          { name: "blockId", type: "string", optional: false },
          { name: "pageSize", type: "integer", optional: true, default: 10, min: 1 },
        ],
        authFieldNames: ["notionToken"],
      },
      {
        id: "notion.action.append-block-children",
        appId: "notion",
        kind: "action",
        name: "Append Block Children",
        fields: [
          { name: "blockId", type: "string", optional: false },
          { name: "children", type: "array", optional: false, default: [{ object: "block", type: "paragraph", paragraph: { rich_text: [] } }] },
        ],
        authFieldNames: ["notionToken"],
      },
      {
        id: "notion.action.update-block",
        appId: "notion",
        kind: "action",
        name: "Update Block",
        fields: [
          { name: "blockId", type: "string", optional: false },
          { name: "type", type: "string", optional: false, default: "paragraph" },
          { name: "paragraph", type: "object", optional: false, default: { rich_text: [{ text: { content: "sample" } }] } },
        ],
        authFieldNames: ["notionToken"],
      },
      {
        id: "notion.action.delete-block",
        appId: "notion",
        kind: "action",
        name: "Delete Block",
        fields: [
          { name: "blockId", type: "string", optional: false },
        ],
        authFieldNames: ["notionToken"],
      },
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
        id: "notion.action.get-page-property",
        appId: "notion",
        kind: "action",
        name: "Get Page Property",
        fields: [
          { name: "pageId", type: "string", optional: false },
          { name: "propertyId", type: "string", optional: false },
        ],
        authFieldNames: ["notionToken"],
      },
      {
        id: "notion.action.get-database",
        appId: "notion",
        kind: "action",
        name: "Get Database",
        fields: [
          { name: "databaseId", type: "string", optional: false },
        ],
        authFieldNames: ["notionToken"],
      },
      {
        id: "notion.action.create-database",
        appId: "notion",
        kind: "action",
        name: "Create Database",
        fields: [
          { name: "pageId", type: "string", optional: false },
          { name: "title", type: "string", optional: false },
          { name: "properties", type: "object", optional: false, default: { Name: { title: {} } } },
        ],
        authFieldNames: ["notionToken"],
      },
      {
        id: "notion.action.update-database",
        appId: "notion",
        kind: "action",
        name: "Update Database",
        fields: [
          { name: "databaseId", type: "string", optional: false },
          { name: "title", type: "string", optional: true },
        ],
        authFieldNames: ["notionToken"],
      },
      {
        id: "notion.action.get-data-source",
        appId: "notion",
        kind: "action",
        name: "Get Data Source",
        fields: [
          { name: "dataSourceId", type: "string", optional: false },
        ],
        authFieldNames: ["notionToken"],
      },
      {
        id: "notion.action.create-data-source",
        appId: "notion",
        kind: "action",
        name: "Create Data Source",
        fields: [
          { name: "databaseId", type: "string", optional: false },
          { name: "title", type: "string", optional: false },
          { name: "properties", type: "object", optional: false, default: { Name: { title: {} } } },
        ],
        authFieldNames: ["notionToken"],
      },
      {
        id: "notion.action.update-data-source",
        appId: "notion",
        kind: "action",
        name: "Update Data Source",
        fields: [
          { name: "dataSourceId", type: "string", optional: false },
          { name: "title", type: "string", optional: true },
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
      {
        id: "notion.action.list-data-source-templates",
        appId: "notion",
        kind: "action",
        name: "List Data Source Templates",
        fields: [
          { name: "dataSourceId", type: "string", optional: false },
          { name: "pageSize", type: "integer", optional: true, default: 10, min: 1 },
        ],
        authFieldNames: ["notionToken"],
      },
      {
        id: "notion.action.get-comment",
        appId: "notion",
        kind: "action",
        name: "Get Comment",
        fields: [
          { name: "commentId", type: "string", optional: false },
        ],
        authFieldNames: ["notionToken"],
      },
      {
        id: "notion.action.list-comments",
        appId: "notion",
        kind: "action",
        name: "List Comments",
        fields: [
          { name: "blockId", type: "string", optional: false },
          { name: "pageSize", type: "integer", optional: true, default: 10, min: 1 },
        ],
        authFieldNames: ["notionToken"],
      },
      {
        id: "notion.action.create-comment",
        appId: "notion",
        kind: "action",
        name: "Create Comment",
        fields: [
          { name: "pageId", type: "string", optional: false },
          { name: "text", type: "string", optional: false },
        ],
        authFieldNames: ["notionToken"],
      },
      {
        id: "notion.action.update-comment",
        appId: "notion",
        kind: "action",
        name: "Update Comment",
        fields: [
          { name: "commentId", type: "string", optional: false },
          { name: "text", type: "string", optional: false },
        ],
        authFieldNames: ["notionToken"],
      },
      {
        id: "notion.action.delete-comment",
        appId: "notion",
        kind: "action",
        name: "Delete Comment",
        fields: [
          { name: "commentId", type: "string", optional: false },
        ],
        authFieldNames: ["notionToken"],
      },
      {
        id: "notion.action.list-users",
        appId: "notion",
        kind: "action",
        name: "List Users",
        fields: [
          { name: "pageSize", type: "integer", optional: true, default: 10, min: 1 },
        ],
        authFieldNames: ["notionToken"],
      },
      {
        id: "notion.action.get-user",
        appId: "notion",
        kind: "action",
        name: "Get User",
        fields: [
          { name: "userId", type: "string", optional: false },
        ],
        authFieldNames: ["notionToken"],
      },
      {
        id: "notion.action.get-self",
        appId: "notion",
        kind: "action",
        name: "Get Self",
        fields: [],
        authFieldNames: ["notionToken"],
      },
      {
        id: "notion.action.list-views",
        appId: "notion",
        kind: "action",
        name: "List Views",
        fields: [
          { name: "databaseId", type: "string", optional: false },
          { name: "pageSize", type: "integer", optional: true, default: 10, min: 1 },
        ],
        authFieldNames: ["notionToken"],
      },
      {
        id: "notion.action.get-view",
        appId: "notion",
        kind: "action",
        name: "Get View",
        fields: [
          { name: "viewId", type: "string", optional: false },
        ],
        authFieldNames: ["notionToken"],
      },
      {
        id: "notion.action.create-view",
        appId: "notion",
        kind: "action",
        name: "Create View",
        fields: [
          { name: "databaseId", type: "string", optional: false },
          { name: "dataSourceId", type: "string", optional: false },
          { name: "name", type: "string", optional: false },
          { name: "type", type: "string", optional: false, default: "table" },
        ],
        authFieldNames: ["notionToken"],
      },
      {
        id: "notion.action.update-view",
        appId: "notion",
        kind: "action",
        name: "Update View",
        fields: [
          { name: "viewId", type: "string", optional: false },
          { name: "name", type: "string", optional: true },
        ],
        authFieldNames: ["notionToken"],
      },
      {
        id: "notion.action.delete-view",
        appId: "notion",
        kind: "action",
        name: "Delete View",
        fields: [
          { name: "viewId", type: "string", optional: false },
        ],
        authFieldNames: ["notionToken"],
      },
      {
        id: "notion.action.create-view-query",
        appId: "notion",
        kind: "action",
        name: "Create View Query",
        fields: [
          { name: "viewId", type: "string", optional: false },
          { name: "pageSize", type: "integer", optional: true, default: 10, min: 1 },
        ],
        authFieldNames: ["notionToken"],
      },
      {
        id: "notion.action.get-view-query-results",
        appId: "notion",
        kind: "action",
        name: "Get View Query Results",
        fields: [
          { name: "viewId", type: "string", optional: false },
          { name: "queryId", type: "string", optional: false },
          { name: "pageSize", type: "integer", optional: true, default: 10, min: 1 },
        ],
        authFieldNames: ["notionToken"],
      },
      {
        id: "notion.action.delete-view-query",
        appId: "notion",
        kind: "action",
        name: "Delete View Query",
        fields: [
          { name: "viewId", type: "string", optional: false },
          { name: "queryId", type: "string", optional: false },
        ],
        authFieldNames: ["notionToken"],
      },
      {
        id: "notion.action.create-file-upload",
        appId: "notion",
        kind: "action",
        name: "Create File Upload",
        fields: [
          { name: "mode", type: "string", optional: true, default: "single_part" },
          { name: "filename", type: "string", optional: true },
          { name: "contentType", type: "string", optional: true, default: "text/plain" },
        ],
        authFieldNames: ["notionToken"],
      },
      {
        id: "notion.action.send-file-upload",
        appId: "notion",
        kind: "action",
        name: "Send File Upload",
        fields: [
          { name: "fileUploadId", type: "string", optional: false },
          { name: "file", type: "string", optional: false },
          { name: "partNumber", type: "integer", optional: true, default: 1, min: 1 },
        ],
        authFieldNames: ["notionToken"],
      },
      {
        id: "notion.action.complete-file-upload",
        appId: "notion",
        kind: "action",
        name: "Complete File Upload",
        fields: [
          { name: "fileUploadId", type: "string", optional: false },
        ],
        authFieldNames: ["notionToken"],
      },
      {
        id: "notion.action.get-file-upload",
        appId: "notion",
        kind: "action",
        name: "Get File Upload",
        fields: [
          { name: "fileUploadId", type: "string", optional: false },
        ],
        authFieldNames: ["notionToken"],
      },
      {
        id: "notion.action.list-file-uploads",
        appId: "notion",
        kind: "action",
        name: "List File Uploads",
        fields: [
          { name: "pageSize", type: "integer", optional: true, default: 10, min: 1 },
        ],
        authFieldNames: ["notionToken"],
      },
      {
        id: "notion.action.list-custom-emojis",
        appId: "notion",
        kind: "action",
        name: "List Custom Emojis",
        fields: [
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

  it("builds Notion block, database, comment, and user request plans", () => {
    assertRequest("notion.action.get-block", { blockId: "block-sample" }, {
      method: "GET",
      endpoint: "blocks/block-sample",
      body: {},
    });
    assertRequest("notion.action.list-block-children", { blockId: "block-sample", pageSize: 10 }, {
      method: "GET",
      endpoint: "blocks/block-sample/children",
      query: { page_size: 10 },
      body: {},
    });
    assertRequest("notion.action.append-block-children", {
      blockId: "block-sample",
      children: [{ object: "block", type: "paragraph", paragraph: { rich_text: [] } }],
    }, {
      method: "PATCH",
      endpoint: "blocks/block-sample/children",
      body: {
        children: [{ object: "block", type: "paragraph", paragraph: { rich_text: [] } }],
      },
    });
    assertRequest("notion.action.update-block", {
      blockId: "block-sample",
      type: "paragraph",
      paragraph: { rich_text: [{ text: { content: "Updated" } }] },
    }, {
      method: "PATCH",
      endpoint: "blocks/block-sample",
      body: {
        paragraph: { rich_text: [{ text: { content: "Updated" } }] },
      },
    });
    assertRequest("notion.action.delete-block", { blockId: "block-sample" }, {
      method: "DELETE",
      endpoint: "blocks/block-sample",
      body: {},
    });
    assertRequest("notion.action.get-page-property", { pageId: "page-sample", propertyId: "title" }, {
      method: "GET",
      endpoint: "pages/page-sample/properties/title",
      body: {},
    });
    assertRequest("notion.action.get-database", { databaseId: "database-sample" }, {
      method: "GET",
      endpoint: "databases/database-sample",
      body: {},
    });
    assertRequest("notion.action.create-database", {
      pageId: "page-sample",
      title: "Tasks",
      properties: { Name: { title: {} } },
    }, {
      method: "POST",
      endpoint: "databases",
      body: {
        parent: { page_id: "page-sample" },
        title: [{ text: { content: "Tasks" } }],
        initial_data_source: {
          title: [{ text: { content: "Tasks" } }],
          properties: { Name: { title: {} } },
        },
      },
    });
    assertRequest("notion.action.update-database", { databaseId: "database-sample", title: "Updated" }, {
      method: "PATCH",
      endpoint: "databases/database-sample",
      body: {
        title: [{ text: { content: "Updated" } }],
      },
    });
    assertRequest("notion.action.get-data-source", { dataSourceId: "data-source-sample" }, {
      method: "GET",
      endpoint: "data_sources/data-source-sample",
      body: {},
    });
    assertRequest("notion.action.create-data-source", {
      databaseId: "database-sample",
      title: "Tasks",
      properties: { Name: { title: {} } },
    }, {
      method: "POST",
      endpoint: "data_sources",
      body: {
        parent: { database_id: "database-sample" },
        title: [{ text: { content: "Tasks" } }],
        properties: { Name: { title: {} } },
      },
    });
    assertRequest("notion.action.update-data-source", { dataSourceId: "data-source-sample", title: "Updated" }, {
      method: "PATCH",
      endpoint: "data_sources/data-source-sample",
      body: {
        title: [{ text: { content: "Updated" } }],
      },
    });
    assertRequest("notion.action.list-data-source-templates", { dataSourceId: "data-source-sample", pageSize: 10 }, {
      method: "GET",
      endpoint: "data_sources/data-source-sample/templates",
      query: { page_size: 10 },
      body: {},
    });
    assertRequest("notion.action.get-comment", { commentId: "comment-sample" }, {
      method: "GET",
      endpoint: "comments/comment-sample",
      body: {},
    });
    assertRequest("notion.action.list-comments", { blockId: "block-sample", pageSize: 10 }, {
      method: "GET",
      endpoint: "comments",
      query: { block_id: "block-sample", page_size: 10 },
      body: {},
    });
    assertRequest("notion.action.create-comment", { pageId: "page-sample", text: "Hello" }, {
      method: "POST",
      endpoint: "comments",
      body: {
        parent: { page_id: "page-sample" },
        rich_text: [{ text: { content: "Hello" } }],
      },
    });
    assertRequest("notion.action.update-comment", { commentId: "comment-sample", text: "Updated" }, {
      method: "PATCH",
      endpoint: "comments/comment-sample",
      body: {
        rich_text: [{ text: { content: "Updated" } }],
      },
    });
    assertRequest("notion.action.delete-comment", { commentId: "comment-sample" }, {
      method: "DELETE",
      endpoint: "comments/comment-sample",
      body: {},
    });
    assertRequest("notion.action.list-users", { pageSize: 10 }, {
      method: "GET",
      endpoint: "users",
      query: { page_size: 10 },
      body: {},
    });
    assertRequest("notion.action.get-user", { userId: "user-sample" }, {
      method: "GET",
      endpoint: "users/user-sample",
      body: {},
    });
    assertRequest("notion.action.get-self", {}, {
      method: "GET",
      endpoint: "users/me",
      body: {},
    });
    assertRequest("notion.action.list-views", { databaseId: "database-sample", pageSize: 10 }, {
      method: "GET",
      endpoint: "views",
      query: { database_id: "database-sample", page_size: 10 },
      body: {},
    });
    assertRequest("notion.action.get-view", { viewId: "view-sample" }, {
      method: "GET",
      endpoint: "views/view-sample",
      body: {},
    });
    assertRequest("notion.action.create-view", {
      databaseId: "database-sample",
      dataSourceId: "data-source-sample",
      name: "Recent",
      type: "table",
    }, {
      method: "POST",
      endpoint: "views",
      body: {
        database_id: "database-sample",
        data_source_id: "data-source-sample",
        name: "Recent",
        type: "table",
      },
    });
    assertRequest("notion.action.update-view", { viewId: "view-sample", name: "Updated" }, {
      method: "PATCH",
      endpoint: "views/view-sample",
      body: {
        name: "Updated",
      },
    });
    assertRequest("notion.action.delete-view", { viewId: "view-sample" }, {
      method: "DELETE",
      endpoint: "views/view-sample",
      body: {},
    });
    assertRequest("notion.action.create-view-query", { viewId: "view-sample", pageSize: 10 }, {
      method: "POST",
      endpoint: "views/view-sample/queries",
      body: {
        page_size: 10,
      },
    });
    assertRequest("notion.action.get-view-query-results", { viewId: "view-sample", queryId: "query-sample", pageSize: 10 }, {
      method: "GET",
      endpoint: "views/view-sample/queries/query-sample/results",
      query: { page_size: 10 },
      body: {},
    });
    assertRequest("notion.action.delete-view-query", { viewId: "view-sample", queryId: "query-sample" }, {
      method: "DELETE",
      endpoint: "views/view-sample/queries/query-sample",
      body: {},
    });
    assertRequest("notion.action.create-file-upload", {
      mode: "single_part",
      filename: "sample.txt",
      contentType: "text/plain",
    }, {
      method: "POST",
      endpoint: "file_uploads",
      body: {
        mode: "single_part",
        filename: "sample.txt",
        content_type: "text/plain",
      },
    });
    assertRequest("notion.action.send-file-upload", { fileUploadId: "file-sample", file: "sample", partNumber: 1 }, {
      method: "POST",
      endpoint: "file_uploads/file-sample/send",
      bodyEncoding: "multipart",
      body: {
        file: "sample",
        part_number: 1,
      },
    });
    assertRequest("notion.action.complete-file-upload", { fileUploadId: "file-sample" }, {
      method: "POST",
      endpoint: "file_uploads/file-sample/complete",
      body: {},
    });
    assertRequest("notion.action.get-file-upload", { fileUploadId: "file-sample" }, {
      method: "GET",
      endpoint: "file_uploads/file-sample",
      body: {},
    });
    assertRequest("notion.action.list-file-uploads", { pageSize: 10 }, {
      method: "GET",
      endpoint: "file_uploads",
      query: { page_size: 10 },
      body: {},
    });
    assertRequest("notion.action.list-custom-emojis", { pageSize: 10 }, {
      method: "GET",
      endpoint: "custom_emojis",
      query: { page_size: 10 },
      body: {},
    });
  });

  it("covers Notion page operations with operation-scoped offline fixtures", async () => {
    const coverage = verifyConnectorRuntimeCoverage(NOTION_CATALOG);
    assert.equal(coverage.summary.missing, 0);
    assert.equal(coverage.summary.implemented, 40);

    const offline = await verifyConnectorRuntimeOfflineExecutions(NOTION_CATALOG);
    assert.deepEqual(offline.results.map((result) => result.operationId).sort(), [
      "notion.action.append-block-children",
      "notion.action.complete-file-upload",
      "notion.action.create-comment",
      "notion.action.create-data-source",
      "notion.action.create-database",
      "notion.action.create-file-upload",
      "notion.action.create-page",
      "notion.action.create-view",
      "notion.action.create-view-query",
      "notion.action.delete-block",
      "notion.action.delete-comment",
      "notion.action.delete-view",
      "notion.action.delete-view-query",
      "notion.action.get-block",
      "notion.action.get-comment",
      "notion.action.get-data-source",
      "notion.action.get-database",
      "notion.action.get-file-upload",
      "notion.action.get-page",
      "notion.action.get-page-property",
      "notion.action.get-self",
      "notion.action.get-user",
      "notion.action.get-view",
      "notion.action.get-view-query-results",
      "notion.action.list-block-children",
      "notion.action.list-comments",
      "notion.action.list-custom-emojis",
      "notion.action.list-data-source-templates",
      "notion.action.list-file-uploads",
      "notion.action.list-users",
      "notion.action.list-views",
      "notion.action.query-data-source",
      "notion.action.search",
      "notion.action.send-file-upload",
      "notion.action.update-block",
      "notion.action.update-comment",
      "notion.action.update-data-source",
      "notion.action.update-database",
      "notion.action.update-page",
      "notion.action.update-view",
    ]);
  });
});

function operation(operationId: string) {
  const found = NOTION_CATALOG.apps[0]?.operations.find((candidate) => candidate.id === operationId);
  assert.ok(found);
  return found;
}

function assertRequest(
  operationId: string,
  values: Record<string, unknown>,
  expected: Record<string, unknown>,
): void {
  assert.deepEqual(stripCommonPlanFields(buildNotionOperationRequest(operation(operationId), values)), expected);
}

function stripCommonPlanFields(plan: ReturnType<typeof buildNotionOperationRequest>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(plan).filter(([key, value]) => (
      !["auth", "headers", "responseSchema", "pagination"].includes(key)
      && !(key === "query" && value && typeof value === "object" && Object.keys(value).length === 0)
    )),
  );
}
