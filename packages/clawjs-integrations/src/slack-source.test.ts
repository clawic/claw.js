import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeConnectorCatalog } from "./catalog.ts";
import {
  verifyConnectorRuntimeCoverage,
  verifyConnectorRuntimeOfflineExecutions,
} from "./runtime-coverage.ts";
import {
  handleConnectorRuntimeWebhook,
} from "./runtime-webhook.ts";
import {
  buildSlackSourcePlan,
  SLACK_SOURCE_OPERATION_SLUGS,
} from "./slack-source.ts";

const SLACK_SOURCE_OPERATIONS = SLACK_SOURCE_OPERATION_SLUGS.map((slug) => source(`slack.source.${slug}`, titleize(slug)));

const SLACK_SOURCE_CATALOG = normalizeConnectorCatalog({
  version: 1,
  apps: [{
    id: "slack",
    name: "Slack",
    authFieldNames: [],
    fields: [],
    operations: SLACK_SOURCE_OPERATIONS,
  }],
});

describe("slack webhook sources", () => {
  it("builds Slack event source plans", () => {
    assert.deepEqual(buildSlackSourcePlan(operation("slack.source.event")), {
      delivery: "webhook",
      dedupe: "event_id",
      hooks: [],
      eventsPath: "event",
    });
  });

  it("extracts Slack Events API callback payloads", () => {
    const result = handleConnectorRuntimeWebhook({
      operation: operation("slack.source.message"),
      payload: {
        token: "verification-token",
        team_id: "T123",
        api_app_id: "A123",
        event_id: "Ev123",
        event_time: 1710000000,
        type: "event_callback",
        event: {
          type: "message",
          channel: "C123",
          user: "U123",
          text: "hello",
          ts: "1710000000.000000",
        },
      },
    });
    assert.deepEqual(result.events, [{
      type: "message",
      channel: "C123",
      user: "U123",
      text: "hello",
      ts: "1710000000.000000",
    }]);
  });

  it("covers Slack webhook sources with operation-scoped offline fixtures", async () => {
    const coverage = verifyConnectorRuntimeCoverage(SLACK_SOURCE_CATALOG);
    assert.equal(coverage.summary.missing, 0);
    assert.equal(coverage.summary.implemented, SLACK_SOURCE_OPERATIONS.length);

    const offline = await verifyConnectorRuntimeOfflineExecutions(SLACK_SOURCE_CATALOG);
    assert.deepEqual(
      offline.results.map((result) => result.operationId).sort(),
      SLACK_SOURCE_OPERATIONS.map((operation) => operation.id).sort(),
    );
  });
});

function operation(operationId: string) {
  const found = SLACK_SOURCE_CATALOG.apps[0]?.operations.find((candidate) => candidate.id === operationId);
  assert.ok(found);
  return found;
}

function source(id: string, name: string) {
  return {
    id,
    appId: "slack",
    kind: "source" as const,
    name,
    fields: [],
    authFieldNames: [],
    runtime: {
      hasRun: false,
      hasHooks: false,
      hasAdditionalProps: false,
      hasMethods: false,
      dedupe: "event_id",
    },
    source: {
      delivery: "webhook" as const,
      usesTimer: false,
      usesHttp: true,
      usesServiceDb: false,
    },
  };
}

function titleize(slug: string): string {
  return slug.split("-").map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`).join(" ");
}
