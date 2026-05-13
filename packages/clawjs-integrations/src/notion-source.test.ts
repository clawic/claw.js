import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { normalizeConnectorCatalog } from "./catalog.ts";
import {
  verifyConnectorRuntimeCoverage,
  verifyConnectorRuntimeOfflineExecutions,
} from "./runtime-coverage.ts";
import {
  handleConnectorRuntimeWebhook,
} from "./runtime-webhook.ts";
import {
  buildNotionSourcePlan,
} from "./notion-source.ts";

const NOTION_SOURCE_CATALOG = normalizeConnectorCatalog({
  version: 1,
  apps: [{
    id: "notion",
    name: "Notion",
    authFieldNames: [],
    fields: [],
    operations: [
      sourceOperation("notion.source.page-event", "Page Event"),
      sourceOperation("notion.source.data-source-event", "Data Source Event"),
      sourceOperation("notion.source.comment-event", "Comment Event"),
      sourceOperation("notion.source.file-upload-event", "File Upload Event"),
      sourceOperation("notion.source.view-event", "View Event"),
    ],
  }],
});

describe("notion webhook sources", () => {
  it("builds Notion webhook source plans", () => {
    assert.deepEqual(buildNotionSourcePlan(operation("notion.source.page-event")), {
      delivery: "webhook",
      dedupe: "id",
      hooks: [],
    });
  });

  it("extracts Notion webhook payloads as source events", () => {
    const result = handleConnectorRuntimeWebhook({
      operation: operation("notion.source.page-event"),
      payload: {
        id: "evt_page_sample",
        type: "page.content_updated",
        entity: {
          id: "page_sample",
          type: "page",
        },
      },
    });
    assert.deepEqual(result.events, [{
      id: "evt_page_sample",
      type: "page.content_updated",
      entity: {
        id: "page_sample",
        type: "page",
      },
    }]);
  });

  it("covers Notion webhook events with operation-scoped offline fixtures", async () => {
    const coverage = verifyConnectorRuntimeCoverage(NOTION_SOURCE_CATALOG);
    assert.equal(coverage.summary.missing, 0);
    assert.equal(coverage.summary.implemented, 5);

    const offline = await verifyConnectorRuntimeOfflineExecutions(NOTION_SOURCE_CATALOG);
    assert.deepEqual(offline.results.map((result) => result.operationId).sort(), [
      "notion.source.comment-event",
      "notion.source.data-source-event",
      "notion.source.file-upload-event",
      "notion.source.page-event",
      "notion.source.view-event",
    ]);
  });
});

function operation(operationId: string) {
  const found = NOTION_SOURCE_CATALOG.apps[0]?.operations.find((candidate) => candidate.id === operationId);
  assert.ok(found);
  return found;
}

function sourceOperation(id: string, name: string) {
  return {
    id,
    appId: "notion",
    kind: "source" as const,
    name,
    fields: [],
    authFieldNames: [],
    runtime: {
      hasRun: false,
      hasHooks: false,
      hasAdditionalProps: false,
      hasMethods: false,
      dedupe: "id",
    },
    source: {
      delivery: "webhook" as const,
      usesTimer: false,
      usesHttp: true,
      usesServiceDb: false,
    },
  };
}
