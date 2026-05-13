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
  buildGitLabSourcePlan,
  GITLAB_SOURCE_SLUGS,
} from "./gitlab-source.ts";

const GITLAB_SOURCE_OPERATIONS = GITLAB_SOURCE_SLUGS.map((slug) => source(`gitlab.source.${slug}`, titleize(slug)));

const GITLAB_SOURCE_CATALOG = normalizeConnectorCatalog({
  version: 1,
  apps: [{
    id: "gitlab",
    name: "GitLab",
    authFieldNames: [],
    fields: [],
    operations: GITLAB_SOURCE_OPERATIONS,
  }],
});

describe("gitlab webhook sources", () => {
  it("builds GitLab webhook source plans", () => {
    assert.deepEqual(buildGitLabSourcePlan(operation("gitlab.source.merge-request")), {
      delivery: "webhook",
      dedupe: "object_id",
      hooks: [],
    });
  });

  it("extracts GitLab webhook payloads as source events", () => {
    const result = handleConnectorRuntimeWebhook({
      operation: operation("gitlab.source.pipeline"),
      payload: {
        object_kind: "pipeline",
        object_attributes: {
          id: 1,
          status: "success",
          ref: "main",
        },
        project: {
          id: 2,
          path_with_namespace: "group/project",
        },
        user: {
          id: 3,
          username: "sample",
        },
      },
    });
    assert.deepEqual(result.events, [{
      object_kind: "pipeline",
      object_attributes: {
        id: 1,
        status: "success",
        ref: "main",
      },
      project: {
        id: 2,
        path_with_namespace: "group/project",
      },
      user: {
        id: 3,
        username: "sample",
      },
    }]);
  });

  it("covers GitLab webhook sources with operation-scoped offline fixtures", async () => {
    const coverage = verifyConnectorRuntimeCoverage(GITLAB_SOURCE_CATALOG);
    assert.equal(coverage.summary.missing, 0);
    assert.equal(coverage.summary.implemented, GITLAB_SOURCE_OPERATIONS.length);

    const offline = await verifyConnectorRuntimeOfflineExecutions(GITLAB_SOURCE_CATALOG);
    assert.deepEqual(
      offline.results.map((result) => result.operationId).sort(),
      GITLAB_SOURCE_OPERATIONS.map((operation) => operation.id).sort(),
    );
  });
});

function operation(operationId: string) {
  const found = GITLAB_SOURCE_CATALOG.apps[0]?.operations.find((candidate) => candidate.id === operationId);
  assert.ok(found);
  return found;
}

function source(id: string, name: string) {
  return {
    id,
    appId: "gitlab",
    kind: "source" as const,
    name,
    fields: [],
    authFieldNames: [],
    runtime: {
      hasRun: false,
      hasHooks: false,
      hasAdditionalProps: false,
      hasMethods: false,
      dedupe: "object_id",
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
