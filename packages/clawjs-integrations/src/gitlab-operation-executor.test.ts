import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeConnectorCatalog } from "./catalog.ts";
import {
  verifyConnectorRuntimeCoverage,
  verifyConnectorRuntimeOfflineExecutions,
} from "./runtime-coverage.ts";
import {
  buildGitLabOperationRequest,
  isGitLabActionOperationSupported,
} from "./gitlab-operation-executor.ts";
import type { ConnectorOperationDefinition } from "./types.ts";

const GITLAB_ACTION_SLUGS = [
  "get-current-user",
  "get-user",
  "list-users",
  "list-projects",
  "get-project",
  "create-project",
  "update-project",
  "delete-project",
  "archive-project",
  "unarchive-project",
  "star-project",
  "unstar-project",
  "fork-project",
  "list-groups",
  "get-group",
  "create-group",
  "update-group",
  "delete-group",
  "list-group-projects",
  "list-project-issues",
  "get-project-issue",
  "create-issue",
  "update-issue",
  "delete-issue",
  "list-issue-notes",
  "create-issue-note",
  "update-issue-note",
  "delete-issue-note",
  "list-project-merge-requests",
  "get-merge-request",
  "create-merge-request",
  "update-merge-request",
  "merge-merge-request",
  "delete-merge-request",
  "list-merge-request-notes",
  "create-merge-request-note",
  "update-merge-request-note",
  "delete-merge-request-note",
  "list-branches",
  "get-branch",
  "create-branch",
  "delete-branch",
  "protect-branch",
  "unprotect-branch",
  "list-tags",
  "get-tag",
  "create-tag",
  "delete-tag",
  "list-repository-tree",
  "get-repository-file",
  "create-repository-file",
  "update-repository-file",
  "delete-repository-file",
  "list-commits",
  "get-commit",
  "create-commit",
  "cherry-pick-commit",
  "revert-commit",
  "list-pipelines",
  "get-pipeline",
  "create-pipeline",
  "retry-pipeline",
  "cancel-pipeline",
  "delete-pipeline",
  "list-jobs",
  "get-job",
  "retry-job",
  "cancel-job",
  "erase-job",
  "play-job",
  "list-releases",
  "get-release",
  "create-release",
  "update-release",
  "delete-release",
  "list-labels",
  "create-label",
  "update-label",
  "delete-label",
  "list-milestones",
  "get-milestone",
  "create-milestone",
  "update-milestone",
  "delete-milestone",
  "list-project-members",
  "add-project-member",
  "update-project-member",
  "remove-project-member",
  "list-project-hooks",
  "get-project-hook",
  "create-project-hook",
  "update-project-hook",
  "delete-project-hook",
  "list-project-variables",
  "get-project-variable",
  "create-project-variable",
  "update-project-variable",
  "delete-project-variable",
] as const;

const GITLAB_ACTIONS = GITLAB_ACTION_SLUGS.map((slug) => operationDefinition(slug, fieldsForOperation(slug)));

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
    operations: GITLAB_ACTIONS,
  }],
});

const auth = [{ type: "secret" as const, field: "gitlabToken", placement: "header" as const, name: "PRIVATE-TOKEN" }];
const headers = { accept: "application/json" };

describe("gitlab operation runtime", () => {
  it("builds GitLab REST request plans for core resources", () => {
    assert.equal(isGitLabActionOperationSupported("gitlab.action.create-merge-request"), true);
    assert.equal(isGitLabActionOperationSupported("gitlab.action.list-merge-requests"), true);
    assert.equal(isGitLabActionOperationSupported("gitlab.action.fly-to-moon"), false);

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

    assert.deepEqual(buildGitLabOperationRequest(operation("create-merge-request"), {
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

    assert.deepEqual(buildGitLabOperationRequest(operation("create-commit"), {
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

    assert.deepEqual(buildGitLabOperationRequest(operation("create-project-hook"), {
      projectId: "group/project",
      url: "https://example.invalid/gitlab",
      pushEvents: true,
      enableSslVerification: false,
    }), {
      method: "POST",
      endpoint: "projects/group%2Fproject/hooks",
      auth,
      headers,
      body: {
        url: "https://example.invalid/gitlab",
        push_events: true,
        enable_ssl_verification: false,
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "url"],
      },
    });
  });

  it("covers GitLab operations with operation-scoped offline fixtures", async () => {
    const coverage = verifyConnectorRuntimeCoverage(GITLAB_CATALOG);
    assert.equal(coverage.summary.missing, 0);
    assert.equal(coverage.summary.implemented, GITLAB_ACTIONS.length);

    const offline = await verifyConnectorRuntimeOfflineExecutions(GITLAB_CATALOG);
    assert.deepEqual(
      offline.results.map((result) => result.operationId).sort(),
      GITLAB_ACTIONS.map((operation) => operation.id).sort(),
    );
  });
});

function operation(slug: string): ConnectorOperationDefinition {
  const operationId = `gitlab.action.${slug}`;
  const found = GITLAB_CATALOG.apps[0]?.operations.find((candidate) => candidate.id === operationId);
  assert.ok(found);
  return found;
}

function operationDefinition(slug: string, fields: ConnectorOperationDefinition["fields"]) {
  return {
    id: `gitlab.action.${slug}`,
    appId: "gitlab",
    kind: "action" as const,
    name: titleize(slug),
    fields,
    authFieldNames: ["gitlabToken"],
  };
}

function fieldsForOperation(slug: string): ConnectorOperationDefinition["fields"] {
  if (slug === "get-current-user") return [];
  if (slug === "get-user") return [integerField("userId")];
  if (slug === "list-users" || slug === "list-projects" || slug === "list-groups") return pagingFields();
  if (slug === "create-project") return [stringField("name")];
  if (slug === "create-group") return [stringField("name"), stringField("path")];
  if (slug === "get-group" || slug === "update-group" || slug === "delete-group" || slug === "list-group-projects") {
    return [stringField("groupId"), ...optionalNameFields(slug), ...listFields(slug)];
  }

  const fields = [stringField("projectId")];
  fields.push(...listFields(slug));
  if (slug.includes("issue")) fields.push(integerField("issueIid"));
  if (slug.includes("merge-request")) fields.push(integerField("mergeRequestIid"));
  if (slug.includes("note")) fields.push(integerField("noteId"), stringField("body"));
  if (slug.includes("branch")) fields.push(stringField("branch"), optionalStringField("ref", "main"));
  if (slug.includes("tag") || slug.includes("release")) fields.push(stringField("tagName"));
  if (slug === "create-tag") fields.push(optionalStringField("ref", "main"));
  if (slug === "create-release" || slug === "update-release") fields.push(optionalStringField("name", "sample"));
  if (slug.includes("repository-file")) fields.push(stringField("filePath"), optionalStringField("branch", "main"), optionalStringField("ref", "main"), stringField("commitMessage"), stringField("content"));
  if (slug.includes("commit")) fields.push(stringField("sha"), optionalStringField("branch", "main"), stringField("commitMessage"), arrayField("actions", [{ action: "create", file_path: "sample.txt", content: "sample" }]));
  if (slug.includes("pipeline")) fields.push(integerField("pipelineId"), optionalStringField("ref", "main"));
  if (slug.includes("job")) fields.push(integerField("jobId"));
  if (slug.includes("milestone")) fields.push(integerField("milestoneId"), stringField("title"));
  if (slug.includes("member")) fields.push(integerField("userId"), integerField("accessLevel", 30));
  if (slug.includes("hook")) fields.push(integerField("hookId"), optionalStringField("url", "https://example.invalid/webhook"));
  if (slug.includes("variable")) fields.push(stringField("key"), optionalStringField("value", "sample"));
  if (slug.includes("label")) fields.push(stringField("name"), optionalStringField("newName", "sample"), optionalStringField("color", "#428BCA"));
  if (slug === "create-issue" || slug === "update-issue" || slug === "create-merge-request" || slug === "update-merge-request") fields.push(stringField("title"));
  if (slug === "create-merge-request") fields.push(stringField("sourceBranch"), optionalStringField("targetBranch", "main"));
  return dedupeFields(fields.filter((field) => requiredForSlug(slug, field.name)));
}

function requiredForSlug(slug: string, fieldName: string): boolean {
  if (slug === "list-issue-notes" && fieldName === "issueIid") return true;
  if (slug === "list-merge-request-notes" && fieldName === "mergeRequestIid") return true;
  if (slug.startsWith("list-") && fieldName !== "projectId" && fieldName !== "groupId" && !["perPage", "page"].includes(fieldName)) return false;
  if (slug.startsWith("get-") && ["body", "content", "commitMessage", "accessLevel", "url", "value", "newName", "color", "title"].includes(fieldName)) return false;
  if (slug === "delete-repository-file" && fieldName === "commitMessage") return true;
  if ((slug.startsWith("delete-") || slug.startsWith("remove-") || slug.startsWith("cancel-") || slug.startsWith("retry-") || slug.startsWith("erase-") || slug.startsWith("play-")) && ["body", "content", "commitMessage", "accessLevel", "url", "value", "newName", "color", "title", "ref"].includes(fieldName)) return false;
  return true;
}

function listFields(slug: string): ConnectorOperationDefinition["fields"] {
  return slug.startsWith("list-") ? pagingFields() : [];
}

function optionalNameFields(slug: string): ConnectorOperationDefinition["fields"] {
  return slug.startsWith("update-") ? [optionalStringField("name", "sample")] : [];
}

function pagingFields(): ConnectorOperationDefinition["fields"] {
  return [
    integerField("perPage", 20, true, 100),
    integerField("page", 1, true),
  ];
}

function dedupeFields(fields: ConnectorOperationDefinition["fields"]): ConnectorOperationDefinition["fields"] {
  const seen = new Set<string>();
  return fields.filter((field) => {
    if (seen.has(field.name)) return false;
    seen.add(field.name);
    return true;
  });
}

function stringField(name: string): ConnectorOperationDefinition["fields"][number] {
  return { name, type: "string", optional: false };
}

function optionalStringField(name: string, defaultValue: string): ConnectorOperationDefinition["fields"][number] {
  return { name, type: "string", optional: true, default: defaultValue };
}

function integerField(name: string, min = 1, optional = false, max?: number): ConnectorOperationDefinition["fields"][number] {
  return { name, type: "integer", optional, min, ...(optional ? { default: min } : {}), ...(max ? { max } : {}) };
}

function arrayField(name: string, defaultValue: unknown[]): ConnectorOperationDefinition["fields"][number] {
  return { name, type: "array", optional: false, default: defaultValue as never };
}

function titleize(slug: string): string {
  return slug.split("-").map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`).join(" ");
}
