import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeConnectorCatalog } from "./catalog.ts";
import {
  buildGitLabOperationRequest,
} from "./gitlab-operation-executor.ts";

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
      {
        id: "gitlab.action.list-project-issues",
        appId: "gitlab",
        kind: "action",
        name: "List Project Issues",
        fields: [
          { name: "projectId", type: "string", optional: false },
          { name: "state", type: "string", optional: true, default: "opened" },
          { name: "perPage", type: "integer", optional: true, default: 20, min: 1 },
          { name: "page", type: "integer", optional: true, default: 1, min: 1 },
        ],
        authFieldNames: ["gitlabToken"],
      },
      {
        id: "gitlab.action.get-project-issue",
        appId: "gitlab",
        kind: "action",
        name: "Get Project Issue",
        fields: [
          { name: "projectId", type: "string", optional: false },
          { name: "issueIid", type: "integer", optional: false },
        ],
        authFieldNames: ["gitlabToken"],
      },
      {
        id: "gitlab.action.create-issue",
        appId: "gitlab",
        kind: "action",
        name: "Create Issue",
        fields: [
          { name: "projectId", type: "string", optional: false },
          { name: "title", type: "string", optional: false },
          { name: "description", type: "string", optional: true },
        ],
        authFieldNames: ["gitlabToken"],
      },
      {
        id: "gitlab.action.update-issue",
        appId: "gitlab",
        kind: "action",
        name: "Update Issue",
        fields: [
          { name: "projectId", type: "string", optional: false },
          { name: "issueIid", type: "integer", optional: false },
          { name: "title", type: "string", optional: true },
          { name: "stateEvent", type: "string", optional: true },
        ],
        authFieldNames: ["gitlabToken"],
      },
      {
        id: "gitlab.action.create-issue-note",
        appId: "gitlab",
        kind: "action",
        name: "Create Issue Note",
        fields: [
          { name: "projectId", type: "string", optional: false },
          { name: "issueIid", type: "integer", optional: false },
          { name: "body", type: "string", optional: false },
          { name: "internal", type: "boolean", optional: true },
        ],
        authFieldNames: ["gitlabToken"],
      },
    ],
  }],
});

describe("gitlab operation runtime", () => {
  it("builds GitLab issue and note request plans", () => {
    const list = operation("gitlab.action.list-project-issues");
    const get = operation("gitlab.action.get-project-issue");
    const create = operation("gitlab.action.create-issue");
    const update = operation("gitlab.action.update-issue");
    const note = operation("gitlab.action.create-issue-note");
    const auth = [{ type: "secret" as const, field: "gitlabToken", placement: "header" as const, name: "PRIVATE-TOKEN" }];
    const headers = { accept: "application/json" };

    assert.deepEqual(buildGitLabOperationRequest(list, {
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

    assert.deepEqual(buildGitLabOperationRequest(get, {
      projectId: "group/project",
      issueIid: 11,
    }), {
      method: "GET",
      endpoint: "projects/group%2Fproject/issues/11",
      auth,
      headers,
      body: {},
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "iid", "title"],
      },
    });

    assert.deepEqual(buildGitLabOperationRequest(create, {
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

    assert.deepEqual(buildGitLabOperationRequest(update, {
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

    assert.deepEqual(buildGitLabOperationRequest(note, {
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
});

function operation(operationId: string) {
  const found = GITLAB_CATALOG.apps[0]?.operations.find((candidate) => candidate.id === operationId);
  assert.ok(found);
  return found;
}
