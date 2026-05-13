import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { normalizeConnectorCatalog } from "./catalog.ts";
import {
  verifyConnectorRuntimeCoverage,
  verifyConnectorRuntimeOfflineExecutions,
} from "./runtime-coverage.ts";
import {
  buildGitHubOperationRequest,
  GITHUB_EXTRA_ACTION_SPECS,
} from "./github-operation-executor.ts";

const REPO_FIELDS = [
  field("owner", "string"),
  field("repo", "string"),
];

const ISSUE_FIELDS = [
  ...REPO_FIELDS,
  field("issueNumber", "integer", false, { min: 1 }),
];

const PULL_FIELDS = [
  ...REPO_FIELDS,
  field("pullNumber", "integer", false, { min: 1 }),
];

const GITHUB_ACTIONS = [
  action("github.action.get-authenticated-user", "Get Authenticated User", []),
  action("github.action.get-user", "Get User", [field("username", "string")]),
  action("github.action.list-user-repositories", "List User Repositories", pagingFields()),
  action("github.action.list-org-repositories", "List Organization Repositories", [field("org", "string"), ...pagingFields()]),
  action("github.action.create-user-repository", "Create User Repository", [field("name", "string")]),
  action("github.action.create-org-repository", "Create Organization Repository", [field("org", "string"), field("name", "string")]),
  action("github.action.get-repository", "Get Repository", REPO_FIELDS),
  action("github.action.update-repository", "Update Repository", [...REPO_FIELDS, field("name", "string", true, { default: "sample" })]),
  action("github.action.delete-repository", "Delete Repository", REPO_FIELDS),
  action("github.action.list-branches", "List Branches", [...REPO_FIELDS, ...pagingFields()]),
  action("github.action.get-branch", "Get Branch", [...REPO_FIELDS, field("branch", "string")]),
  action("github.action.get-repository-content", "Get Repository Content", [...REPO_FIELDS, field("path", "string")]),
  action("github.action.create-or-update-file", "Create Or Update File", [...REPO_FIELDS, field("path", "string"), field("message", "string"), field("content", "string")]),
  action("github.action.delete-file", "Delete File", [...REPO_FIELDS, field("path", "string"), field("message", "string"), field("sha", "string")]),
  action("github.action.get-issue", "Get Issue", ISSUE_FIELDS),
  action("github.action.list-repository-issues", "List Repository Issues", [...REPO_FIELDS, field("state", "string", true, { default: "open" }), ...pagingFields()]),
  action("github.action.create-issue", "Create Issue", [...REPO_FIELDS, field("title", "string"), field("body", "string", true)]),
  action("github.action.update-issue", "Update Issue", [...ISSUE_FIELDS, field("title", "string", true, { default: "sample" })]),
  action("github.action.lock-issue", "Lock Issue", ISSUE_FIELDS),
  action("github.action.unlock-issue", "Unlock Issue", ISSUE_FIELDS),
  action("github.action.list-issue-comments", "List Issue Comments", [...ISSUE_FIELDS, ...pagingFields()]),
  action("github.action.create-issue-comment", "Create Issue Comment", [...ISSUE_FIELDS, field("body", "string")]),
  action("github.action.update-issue-comment", "Update Issue Comment", [...REPO_FIELDS, field("commentId", "integer", false, { min: 1 }), field("body", "string")]),
  action("github.action.delete-issue-comment", "Delete Issue Comment", [...REPO_FIELDS, field("commentId", "integer", false, { min: 1 })]),
  action("github.action.list-labels", "List Labels", [...REPO_FIELDS, ...pagingFields()]),
  action("github.action.create-label", "Create Label", [...REPO_FIELDS, field("name", "string"), field("color", "string", false, { default: "0e8a16" })]),
  action("github.action.update-label", "Update Label", [...REPO_FIELDS, field("name", "string"), field("newName", "string", true, { default: "sample" })]),
  action("github.action.delete-label", "Delete Label", [...REPO_FIELDS, field("name", "string")]),
  action("github.action.list-milestones", "List Milestones", [...REPO_FIELDS, ...pagingFields()]),
  action("github.action.create-milestone", "Create Milestone", [...REPO_FIELDS, field("title", "string")]),
  action("github.action.update-milestone", "Update Milestone", [...REPO_FIELDS, field("milestoneNumber", "integer", false, { min: 1 }), field("title", "string", true, { default: "sample" })]),
  action("github.action.delete-milestone", "Delete Milestone", [...REPO_FIELDS, field("milestoneNumber", "integer", false, { min: 1 })]),
  action("github.action.list-pull-requests", "List Pull Requests", [...REPO_FIELDS, field("state", "string", true, { default: "open" }), ...pagingFields()]),
  action("github.action.get-pull-request", "Get Pull Request", PULL_FIELDS),
  action("github.action.create-pull-request", "Create Pull Request", [...REPO_FIELDS, field("title", "string"), field("head", "string"), field("base", "string")]),
  action("github.action.update-pull-request", "Update Pull Request", [...PULL_FIELDS, field("title", "string", true, { default: "sample" })]),
  action("github.action.merge-pull-request", "Merge Pull Request", PULL_FIELDS),
  action("github.action.list-pull-request-files", "List Pull Request Files", [...PULL_FIELDS, ...pagingFields()]),
  action("github.action.list-pull-request-commits", "List Pull Request Commits", [...PULL_FIELDS, ...pagingFields()]),
  action("github.action.list-releases", "List Releases", [...REPO_FIELDS, ...pagingFields()]),
  action("github.action.get-release", "Get Release", [...REPO_FIELDS, field("releaseId", "integer", false, { min: 1 })]),
  action("github.action.create-release", "Create Release", [...REPO_FIELDS, field("tagName", "string")]),
  action("github.action.update-release", "Update Release", [...REPO_FIELDS, field("releaseId", "integer", false, { min: 1 }), field("name", "string", true, { default: "sample" })]),
  action("github.action.delete-release", "Delete Release", [...REPO_FIELDS, field("releaseId", "integer", false, { min: 1 })]),
  action("github.action.list-workflows", "List Workflows", [...REPO_FIELDS, ...pagingFields()]),
  action("github.action.get-workflow", "Get Workflow", [...REPO_FIELDS, field("workflowId", "string")]),
  action("github.action.dispatch-workflow", "Dispatch Workflow", [...REPO_FIELDS, field("workflowId", "string"), field("ref", "string", false, { default: "main" })]),
  action("github.action.list-workflow-runs", "List Workflow Runs", [...REPO_FIELDS, ...pagingFields()]),
  action("github.action.get-workflow-run", "Get Workflow Run", [...REPO_FIELDS, field("runId", "integer", false, { min: 1 })]),
  action("github.action.rerun-workflow-run", "Rerun Workflow Run", [...REPO_FIELDS, field("runId", "integer", false, { min: 1 })]),
  action("github.action.cancel-workflow-run", "Cancel Workflow Run", [...REPO_FIELDS, field("runId", "integer", false, { min: 1 })]),
  action("github.action.list-repository-webhooks", "List Repository Webhooks", [...REPO_FIELDS, ...pagingFields()]),
  action("github.action.get-repository-webhook", "Get Repository Webhook", [...REPO_FIELDS, field("hookId", "integer", false, { min: 1 })]),
  action("github.action.create-repository-webhook", "Create Repository Webhook", [...REPO_FIELDS, field("config", "object", false, { default: { url: "https://example.invalid/webhook", content_type: "json" } })]),
  action("github.action.delete-repository-webhook", "Delete Repository Webhook", [...REPO_FIELDS, field("hookId", "integer", false, { min: 1 })]),
  action("github.action.ping-repository-webhook", "Ping Repository Webhook", [...REPO_FIELDS, field("hookId", "integer", false, { min: 1 })]),
  action("github.action.list-gists", "List Gists", pagingFields()),
  action("github.action.get-gist", "Get Gist", [field("gistId", "string")]),
  action("github.action.create-gist", "Create Gist", [field("files", "object", false, { default: { "sample.txt": { content: "sample" } } })]),
  action("github.action.update-gist", "Update Gist", [field("gistId", "string"), field("files", "object", true, { default: { "sample.txt": { content: "sample" } } })]),
  action("github.action.delete-gist", "Delete Gist", [field("gistId", "string")]),
  ...GITHUB_EXTRA_ACTION_SPECS.map((spec) => action(`github.action.${spec.slug}`, titleize(spec.slug), spec.fields)),
];

const GITHUB_CATALOG = normalizeConnectorCatalog({
  version: 1,
  apps: [{
    id: "github",
    name: "GitHub",
    authFieldNames: ["githubToken"],
    fields: [{
      name: "githubToken",
      type: "app",
      optional: false,
      secret: true,
    }],
    operations: GITHUB_ACTIONS,
  }],
});

describe("github operation runtime", () => {
  it("builds GitHub REST request plans for core resources", () => {
    const headers = {
      accept: "application/vnd.github+json",
      "x-github-api-version": "2026-03-10",
    };
    const auth = [{ type: "secret" as const, field: "githubToken", placement: "bearer" as const }];

    assert.deepEqual(buildGitHubOperationRequest(operation("github.action.get-issue"), {
      owner: "octocat",
      repo: "Hello-World",
      issueNumber: 1347,
    }), {
      method: "GET",
      endpoint: "repos/octocat/Hello-World/issues/1347",
      auth,
      headers,
      query: {},
      body: {},
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "number", "title"],
      },
    });

    assert.deepEqual(buildGitHubOperationRequest(operation("github.action.create-pull-request"), {
      owner: "octocat",
      repo: "Hello-World",
      title: "Add docs",
      head: "feature",
      base: "main",
    }), {
      method: "POST",
      endpoint: "repos/octocat/Hello-World/pulls",
      auth,
      headers,
      body: {
        title: "Add docs",
        head: "feature",
        base: "main",
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "number", "title"],
      },
    });

    assert.deepEqual(buildGitHubOperationRequest(operation("github.action.dispatch-workflow"), {
      owner: "octocat",
      repo: "Hello-World",
      workflowId: "ci.yml",
      ref: "main",
      inputs: { dry_run: "true" },
    }), {
      method: "POST",
      endpoint: "repos/octocat/Hello-World/actions/workflows/ci.yml/dispatches",
      auth,
      headers,
      body: {
        ref: "main",
        inputs: { dry_run: "true" },
      },
      responseSchema: {
        type: "object",
      },
    });

    assert.deepEqual(buildGitHubOperationRequest(operation("github.action.create-gist"), {
      files: { "sample.txt": { content: "hello" } },
      public: false,
    }), {
      method: "POST",
      endpoint: "gists",
      auth,
      headers,
      body: {
        files: { "sample.txt": { content: "hello" } },
        public: false,
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "files"],
      },
    });

    assert.deepEqual(buildGitHubOperationRequest(operation("github.action.list-commits"), {
      owner: "octocat",
      repo: "Hello-World",
      sha: "main",
      path: "README.md",
      author: "octocat",
      since: "2026-01-01T00:00:00Z",
      until: "2026-01-02T00:00:00Z",
      perPage: 1,
      page: 1,
    }), {
      method: "GET",
      endpoint: "repos/octocat/Hello-World/commits",
      auth,
      headers,
      query: {
        sha: "main",
        path: "README.md",
        author: "octocat",
        since: "2026-01-01T00:00:00Z",
        until: "2026-01-02T00:00:00Z",
        per_page: 1,
        page: 1,
      },
      body: {},
      pagination: {
        mode: "offset",
        itemsPath: "",
        offsetParam: "page",
        limitParam: "per_page",
        pageSize: 1,
        maxPages: 1,
      },
      responseSchema: {
        type: "array",
      },
    });

    assert.deepEqual(buildGitHubOperationRequest(operation("github.action.create-deployment-status"), {
      owner: "octocat",
      repo: "Hello-World",
      deploymentId: 42,
      state: "success",
      targetUrl: "https://example.invalid/deploy",
      logUrl: "https://example.invalid/deploy/log",
      description: "Deployment finished",
      environment: "production",
      autoInactive: true,
    }), {
      method: "POST",
      endpoint: "repos/octocat/Hello-World/deployments/42/statuses",
      auth,
      headers,
      body: {
        state: "success",
        target_url: "https://example.invalid/deploy",
        log_url: "https://example.invalid/deploy/log",
        description: "Deployment finished",
        environment: "production",
        auto_inactive: true,
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "state"],
      },
    });

    assert.deepEqual(buildGitHubOperationRequest(operation("github.action.search-repositories"), {
      q: "topic:integrations",
      sort: "stars",
      order: "desc",
      perPage: 1,
      page: 1,
    }), {
      method: "GET",
      endpoint: "search/repositories",
      auth,
      headers,
      query: {
        q: "topic:integrations",
        sort: "stars",
        order: "desc",
        per_page: 1,
        page: 1,
      },
      body: {},
      responseSchema: {
        type: "object",
        requiredPaths: ["total_count", "items"],
      },
    });
  });

  it("covers GitHub operations with operation-scoped offline fixtures", async () => {
    const coverage = verifyConnectorRuntimeCoverage(GITHUB_CATALOG);
    assert.equal(coverage.summary.missing, 0);
    assert.equal(coverage.summary.implemented, GITHUB_ACTIONS.length);

    const offline = await verifyConnectorRuntimeOfflineExecutions(GITHUB_CATALOG);
    assert.deepEqual(
      offline.results.map((result) => result.operationId).sort(),
      GITHUB_ACTIONS.map((operation) => operation.id).sort(),
    );
  });
});

function operation(operationId: string) {
  const found = GITHUB_CATALOG.apps[0]?.operations.find((candidate) => candidate.id === operationId);
  assert.ok(found);
  return found;
}

function action(id: string, name: string, fields: Array<{
  name: string;
  type: string;
  optional: boolean;
  default?: unknown;
  min?: number;
  max?: number;
}>) {
  return {
    id,
    appId: "github",
    kind: "action" as const,
    name,
    fields,
    authFieldNames: ["githubToken"],
  };
}

function field(name: string, type: string, optional = false, extras: {
  default?: unknown;
  min?: number;
  max?: number;
} = {}) {
  return { name, type, optional, ...extras };
}

function pagingFields() {
  return [
    field("perPage", "integer", true, { default: 1, min: 1, max: 100 }),
    field("page", "integer", true, { default: 1, min: 1 }),
  ];
}

function titleize(slug: string): string {
  return slug.split("-").map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`).join(" ");
}
