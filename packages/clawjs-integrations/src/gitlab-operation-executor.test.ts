import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeConnectorCatalog } from "./catalog.ts";
import {
  buildGitLabOperationRequest,
  isGitLabActionOperationSupported,
} from "./gitlab-operation-executor.ts";
import {
  verifyConnectorRuntimeCoverage,
  verifyConnectorRuntimeOfflineExecutions,
} from "./runtime-coverage.ts";
import type { ConnectorOperationDefinition } from "./types.ts";

const GITLAB_CATALOG = normalizeConnectorCatalog({
  version: 1,
  apps: [{
    id: "gitlab",
    name: "GitLab",
    authFieldNames: ["gitlabToken"],
    fields: [{
      name: "gitlabToken",
      type: "app",
      optional: false,
      secret: true,
    }],
    operations: [
      operationDefinition("list-project-issues", [
        { name: "projectId", type: "string", optional: false },
        { name: "state", type: "string", optional: true, default: "opened" },
        { name: "perPage", type: "integer", optional: true, default: 20, min: 1 },
        { name: "page", type: "integer", optional: true, default: 1, min: 1 },
      ]),
      operationDefinition("get-project-issue", [
        { name: "projectId", type: "string", optional: false },
        { name: "issueIid", type: "integer", optional: false },
      ]),
      operationDefinition("create-issue", [
        { name: "projectId", type: "string", optional: false },
        { name: "title", type: "string", optional: false },
        { name: "description", type: "string", optional: true },
      ]),
      operationDefinition("update-issue", [
        { name: "projectId", type: "string", optional: false },
        { name: "issueIid", type: "integer", optional: false },
        { name: "title", type: "string", optional: true },
        { name: "stateEvent", type: "string", optional: true },
      ]),
      operationDefinition("create-issue-note", [
        { name: "projectId", type: "string", optional: false },
        { name: "issueIid", type: "integer", optional: false },
        { name: "body", type: "string", optional: false },
        { name: "internal", type: "boolean", optional: true },
      ]),
    ],
  }],
});

const auth = [{ type: "secret" as const, field: "gitlabToken", placement: "header" as const, name: "PRIVATE-TOKEN" }];
const headers = { accept: "application/json" };

describe("gitlab operation runtime", () => {
  it("builds GitLab issue and note request plans", () => {
    assert.deepEqual(buildGitLabOperationRequest(operation("list-project-issues"), {
      projectId: "group/project",
      state: "opened",
      perPage: 20,
      page: 1,
    }), {
      method: "GET",
      endpoint: "projects/group%2Fproject/issues",
      auth,
      headers,
      query: {
        state: "opened",
        per_page: 20,
        page: 1,
      },
      body: {},
      pagination: {
        mode: "offset",
        itemsPath: "",
        offsetParam: "page",
        limitParam: "per_page",
        pageSize: 20,
        maxPages: 1,
      },
      responseSchema: {
        type: "array",
      },
    });

    assert.deepEqual(buildGitLabOperationRequest(operation("get-project-issue"), {
      projectId: "group/project",
      issueIid: 11,
    }), {
      method: "GET",
      endpoint: "projects/group%2Fproject/issues/11",
      auth,
      headers,
      query: {},
      body: {},
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "iid", "title"],
      },
    });

    assert.deepEqual(buildGitLabOperationRequest(operation("create-issue"), {
      projectId: "group/project",
      title: "Found a bug",
      description: "Steps to reproduce",
      labels: "bug,backend",
    }), {
      method: "POST",
      endpoint: "projects/group%2Fproject/issues",
      auth,
      headers,
      body: {
        title: "Found a bug",
        description: "Steps to reproduce",
        labels: "bug,backend",
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "iid", "title"],
      },
    });

    assert.deepEqual(buildGitLabOperationRequest(operation("update-issue"), {
      projectId: "group/project",
      issueIid: "11",
      title: "Fixed title",
      stateEvent: "close",
    }), {
      method: "PUT",
      endpoint: "projects/group%2Fproject/issues/11",
      auth,
      headers,
      body: {
        title: "Fixed title",
        state_event: "close",
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "iid", "title"],
      },
    });

    assert.deepEqual(buildGitLabOperationRequest(operation("create-issue-note"), {
      projectId: "group/project",
      issueIid: 11,
      body: "Needs investigation",
      internal: true,
    }), {
      method: "POST",
      endpoint: "projects/group%2Fproject/issues/11/notes",
      auth,
      headers,
      body: {
        body: "Needs investigation",
        internal: true,
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "body"],
      },
    });
  });

  it("builds representative expanded GitLab request plans", () => {
    assert.equal(isGitLabActionOperationSupported("gitlab.action.create-merge-request"), true);
    assert.equal(isGitLabActionOperationSupported("gitlab.action.list-merge-requests"), true);
    assert.equal(isGitLabActionOperationSupported("gitlab.action.fly-to-moon"), false);

    assert.deepEqual(buildGitLabOperationRequest(runtimeOperation("create-merge-request"), {
      projectId: "group/project",
      sourceBranch: "feature/gitlab",
      targetBranch: "main",
      title: "Add GitLab runtime",
      removeSourceBranch: true,
    }), {
      method: "POST",
      endpoint: "projects/group%2Fproject/merge_requests",
      auth,
      headers,
      body: {
        source_branch: "feature/gitlab",
        target_branch: "main",
        title: "Add GitLab runtime",
        remove_source_branch: true,
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "iid", "title"],
      },
    });

    assert.deepEqual(buildGitLabOperationRequest(runtimeOperation("get-repository-file"), {
      projectId: "group/project",
      filePath: "src/index.ts",
      ref: "main",
    }), {
      method: "GET",
      endpoint: "projects/group%2Fproject/repository/files/src%2Findex.ts",
      auth,
      headers,
      query: {
        ref: "main",
      },
      body: {},
      responseSchema: {
        type: "object",
        requiredPaths: ["file_path", "content"],
      },
    });

    assert.deepEqual(buildGitLabOperationRequest(runtimeOperation("create-commit"), {
      projectId: "group/project",
      branch: "main",
      commitMessage: "Update docs",
      actions: [{ action: "update", file_path: "README.md", content: "Hi" }],
    }), {
      method: "POST",
      endpoint: "projects/group%2Fproject/repository/commits",
      auth,
      headers,
      body: {
        branch: "main",
        commit_message: "Update docs",
        actions: [{ action: "update", file_path: "README.md", content: "Hi" }],
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "short_id", "title"],
      },
    });

    assert.deepEqual(buildGitLabOperationRequest(runtimeOperation("create-project-hook"), {
      projectId: "group/project",
      url: "https://example.test/gitlab",
      pushEvents: true,
      enableSslVerification: false,
    }), {
      method: "POST",
      endpoint: "projects/group%2Fproject/hooks",
      auth,
      headers,
      body: {
        url: "https://example.test/gitlab",
        push_events: true,
        enable_ssl_verification: false,
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "url"],
      },
    });
  });

  it("covers GitLab issue operations with operation-scoped offline fixtures", async () => {
    const coverage = verifyConnectorRuntimeCoverage(GITLAB_CATALOG);
    assert.equal(coverage.summary.missing, 0);
    assert.equal(coverage.summary.implemented, 5);

    const offline = await verifyConnectorRuntimeOfflineExecutions(GITLAB_CATALOG);
    assert.deepEqual(offline.results.map((result) => result.operationId).sort(), [
      "gitlab.action.create-issue",
      "gitlab.action.create-issue-note",
      "gitlab.action.get-project-issue",
      "gitlab.action.list-project-issues",
      "gitlab.action.update-issue",
    ]);
  });
});

function operation(slug: string): ConnectorOperationDefinition {
  const operationId = `gitlab.action.${slug}`;
  const found = GITLAB_CATALOG.apps[0]?.operations.find((candidate) => candidate.id === operationId);
  assert.ok(found);
  return found;
}

function runtimeOperation(slug: string): ConnectorOperationDefinition {
  return {
    id: `gitlab.action.${slug}`,
    appId: "gitlab",
    kind: "action",
    name: slug,
    fields: [],
    authFieldNames: ["gitlabToken"],
  };
}

function operationDefinition(slug: string, fields: ConnectorOperationDefinition["fields"]) {
  return {
    id: `gitlab.action.${slug}`,
    appId: "gitlab",
    kind: "action" as const,
    name: slug,
    fields,
    authFieldNames: ["gitlabToken"],
  };
}
