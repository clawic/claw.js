import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeConnectorCatalog } from "./catalog.ts";
import {
  buildGitHubOperationRequest,
} from "./github-operation-executor.ts";

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
    operations: [
      {
        id: "github.action.get-issue",
        appId: "github",
        kind: "action",
        name: "Get Issue",
        fields: [
          { name: "owner", type: "string", optional: false },
          { name: "repo", type: "string", optional: false },
          { name: "issueNumber", type: "integer", optional: false },
        ],
        authFieldNames: ["githubToken"],
      },
      {
        id: "github.action.list-repository-issues",
        appId: "github",
        kind: "action",
        name: "List Repository Issues",
        fields: [
          { name: "owner", type: "string", optional: false },
          { name: "repo", type: "string", optional: false },
          { name: "state", type: "string", optional: true },
          { name: "perPage", type: "integer", optional: true },
          { name: "page", type: "integer", optional: true },
        ],
        authFieldNames: ["githubToken"],
      },
      {
        id: "github.action.create-issue",
        appId: "github",
        kind: "action",
        name: "Create Issue",
        fields: [
          { name: "owner", type: "string", optional: false },
          { name: "repo", type: "string", optional: false },
          { name: "title", type: "string", optional: false },
          { name: "body", type: "string", optional: true },
        ],
        authFieldNames: ["githubToken"],
      },
      {
        id: "github.action.create-issue-comment",
        appId: "github",
        kind: "action",
        name: "Create Issue Comment",
        fields: [
          { name: "owner", type: "string", optional: false },
          { name: "repo", type: "string", optional: false },
          { name: "issueNumber", type: "integer", optional: false },
          { name: "body", type: "string", optional: false },
        ],
        authFieldNames: ["githubToken"],
      },
    ],
  }],
});

describe("github operation runtime", () => {
  it("builds GitHub Issues API request plans", () => {
    const get = operation("github.action.get-issue");
    const list = operation("github.action.list-repository-issues");
    const create = operation("github.action.create-issue");
    const comment = operation("github.action.create-issue-comment");
    const headers = {
      accept: "application/vnd.github+json",
      "x-github-api-version": "2026-03-10",
    };
    const auth = [{ type: "secret" as const, field: "githubToken", placement: "bearer" as const }];

    assert.deepEqual(buildGitHubOperationRequest(get, {
      owner: "octocat",
      repo: "Hello-World",
      issueNumber: 1347,
    }), {
      method: "GET",
      endpoint: "repos/octocat/Hello-World/issues/1347",
      auth,
      headers,
      body: {},
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "number", "title"],
      },
    });

    assert.deepEqual(buildGitHubOperationRequest(list, {
      owner: "octocat",
      repo: "Hello-World",
      state: "all",
      perPage: 2,
      page: 1,
    }), {
      method: "GET",
      endpoint: "repos/octocat/Hello-World/issues",
      auth,
      headers,
      query: {
        state: "all",
        per_page: 2,
        page: 1,
      },
      body: {},
      pagination: {
        mode: "offset",
        itemsPath: "",
        offsetParam: "page",
        limitParam: "per_page",
        pageSize: 2,
        maxPages: 1,
      },
      responseSchema: {
        type: "array",
      },
    });

    assert.deepEqual(buildGitHubOperationRequest(create, {
      owner: "octocat",
      repo: "Hello-World",
      title: "Found a bug",
      body: "Steps to reproduce",
      labels: ["bug"],
    }), {
      method: "POST",
      endpoint: "repos/octocat/Hello-World/issues",
      auth,
      headers,
      body: {
        title: "Found a bug",
        body: "Steps to reproduce",
        labels: ["bug"],
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "number", "title"],
      },
    });

    assert.deepEqual(buildGitHubOperationRequest(comment, {
      owner: "octocat",
      repo: "Hello-World",
      issueNumber: "1347",
      body: "Me too",
    }), {
      method: "POST",
      endpoint: "repos/octocat/Hello-World/issues/1347/comments",
      auth,
      headers,
      body: {
        body: "Me too",
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "body"],
      },
    });
  });
});

function operation(operationId: string) {
  const found = GITHUB_CATALOG.apps[0]?.operations.find((candidate) => candidate.id === operationId);
  assert.ok(found);
  return found;
}
