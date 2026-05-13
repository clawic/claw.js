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
  buildGitHubSourcePlan,
} from "./github-source.ts";

const GITHUB_SOURCE_OPERATIONS = [
  source("github.source.webhook-event", "Webhook Event"),
  source("github.source.push", "Push"),
  source("github.source.issues", "Issues"),
  source("github.source.pull-request", "Pull Request"),
  source("github.source.workflow-run", "Workflow Run"),
  source("github.source.release", "Release"),
];

const GITHUB_SOURCE_CATALOG = normalizeConnectorCatalog({
  version: 1,
  apps: [{
    id: "github",
    name: "GitHub",
    authFieldNames: [],
    fields: [],
    operations: GITHUB_SOURCE_OPERATIONS,
  }],
});

describe("github webhook sources", () => {
  it("builds GitHub webhook source plans", () => {
    assert.deepEqual(buildGitHubSourcePlan(operation("github.source.webhook-event")), {
      delivery: "webhook",
      dedupe: "delivery",
      hooks: [],
    });
  });

  it("extracts GitHub webhook payloads as source events", () => {
    const result = handleConnectorRuntimeWebhook({
      operation: operation("github.source.issues"),
      payload: {
        action: "opened",
        issue: {
          id: 1,
          number: 7,
          title: "sample",
        },
        repository: {
          id: 2,
          full_name: "octocat/Hello-World",
        },
        sender: {
          id: 3,
          login: "octocat",
        },
      },
    });
    assert.deepEqual(result.events, [{
      action: "opened",
      issue: {
        id: 1,
        number: 7,
        title: "sample",
      },
      repository: {
        id: 2,
        full_name: "octocat/Hello-World",
      },
      sender: {
        id: 3,
        login: "octocat",
      },
    }]);
  });

  it("covers GitHub webhook sources with operation-scoped offline fixtures", async () => {
    const coverage = verifyConnectorRuntimeCoverage(GITHUB_SOURCE_CATALOG);
    assert.equal(coverage.summary.missing, 0);
    assert.equal(coverage.summary.implemented, GITHUB_SOURCE_OPERATIONS.length);

    const offline = await verifyConnectorRuntimeOfflineExecutions(GITHUB_SOURCE_CATALOG);
    assert.deepEqual(
      offline.results.map((result) => result.operationId).sort(),
      GITHUB_SOURCE_OPERATIONS.map((operation) => operation.id).sort(),
    );
  });
});

function operation(operationId: string) {
  const found = GITHUB_SOURCE_CATALOG.apps[0]?.operations.find((candidate) => candidate.id === operationId);
  assert.ok(found);
  return found;
}

function source(id: string, name: string) {
  return {
    id,
    appId: "github",
    kind: "source" as const,
    name,
    fields: [],
    authFieldNames: [],
    runtime: {
      hasRun: false,
      hasHooks: false,
      hasAdditionalProps: false,
      hasMethods: false,
      dedupe: "delivery",
    },
    source: {
      delivery: "webhook" as const,
      usesTimer: false,
      usesHttp: true,
      usesServiceDb: false,
    },
  };
}
