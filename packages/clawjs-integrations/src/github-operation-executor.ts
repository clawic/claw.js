import type {
  ConnectorRuntimeRequestPlan,
} from "./runtime-registry.ts";
import type {
  ConnectorOperationDefinition,
  IntegrationJson,
} from "./types.ts";

export type GitHubRuntimeOperation =
  | "get-authenticated-user"
  | "get-user"
  | "list-user-repositories"
  | "list-org-repositories"
  | "create-user-repository"
  | "create-org-repository"
  | "get-repository"
  | "update-repository"
  | "delete-repository"
  | "list-branches"
  | "get-branch"
  | "get-repository-content"
  | "create-or-update-file"
  | "delete-file"
  | "get-issue"
  | "list-repository-issues"
  | "create-issue"
  | "update-issue"
  | "lock-issue"
  | "unlock-issue"
  | "list-issue-comments"
  | "create-issue-comment"
  | "update-issue-comment"
  | "delete-issue-comment"
  | "list-labels"
  | "create-label"
  | "update-label"
  | "delete-label"
  | "list-milestones"
  | "create-milestone"
  | "update-milestone"
  | "delete-milestone"
  | "list-pull-requests"
  | "get-pull-request"
  | "create-pull-request"
  | "update-pull-request"
  | "merge-pull-request"
  | "list-pull-request-files"
  | "list-pull-request-commits"
  | "list-releases"
  | "get-release"
  | "create-release"
  | "update-release"
  | "delete-release"
  | "list-workflows"
  | "get-workflow"
  | "dispatch-workflow"
  | "list-workflow-runs"
  | "get-workflow-run"
  | "rerun-workflow-run"
  | "cancel-workflow-run"
  | "list-repository-webhooks"
  | "get-repository-webhook"
  | "create-repository-webhook"
  | "delete-repository-webhook"
  | "ping-repository-webhook"
  | "list-gists"
  | "get-gist"
  | "create-gist"
  | "update-gist"
  | "delete-gist";

export function isGitHubActionOperationSupported(operationId: string): boolean {
  return gitHubRuntimeOperation(operationId) !== null;
}

export function buildGitHubOperationRequest(
  operation: ConnectorOperationDefinition,
  values: Record<string, IntegrationJson>,
): ConnectorRuntimeRequestPlan {
  const runtimeOperation = gitHubRuntimeOperation(operation.id);
  if (!runtimeOperation) {
    throw new Error(`Unsupported GitHub operation: ${operation.id}`);
  }
  const auth = operation.authFieldNames.map((field) => ({
    type: "secret" as const,
    field,
    placement: "bearer" as const,
  }));
  const headers = {
    accept: "application/vnd.github+json",
    "x-github-api-version": "2026-03-10",
  };

  switch (runtimeOperation) {
    case "get-authenticated-user":
      return getPlan("user", auth, headers, {}, ["id", "login"]);
    case "get-user":
      return getPlan(`users/${pathSegment(requiredString(values.username, "username"))}`, auth, headers, {}, ["id", "login"]);
    case "list-user-repositories":
      return getPagedPlan("user/repos", auth, headers, {
        visibility: values.visibility,
        affiliation: values.affiliation,
        type: values.type,
        sort: values.sort,
        direction: values.direction,
        per_page: values.perPage ?? values.per_page ?? 30,
        page: values.page ?? 1,
      }, "array");
    case "list-org-repositories":
      return getPagedPlan(`orgs/${pathSegment(requiredString(firstValue(values.org, values.organization), "org"))}/repos`, auth, headers, {
        type: values.type,
        sort: values.sort,
        direction: values.direction,
        per_page: values.perPage ?? values.per_page ?? 30,
        page: values.page ?? 1,
      }, "array");
    case "create-user-repository":
      return postPlan("user/repos", auth, headers, repositoryBody(values, true), ["id", "name", "full_name"]);
    case "create-org-repository":
      return postPlan(`orgs/${pathSegment(requiredString(firstValue(values.org, values.organization), "org"))}/repos`, auth, headers, repositoryBody(values, true), ["id", "name", "full_name"]);
    case "get-repository":
      return getPlan(repoPath(values), auth, headers, {}, ["id", "name", "full_name"]);
    case "update-repository":
      return patchPlan(repoPath(values), auth, headers, repositoryBody(values, false), ["id", "name", "full_name"]);
    case "delete-repository":
      return deletePlan(repoPath(values), auth, headers);
    case "list-branches":
      return getPagedPlan(`${repoPath(values)}/branches`, auth, headers, {
        protected: values.protected,
        per_page: values.perPage ?? values.per_page ?? 30,
        page: values.page ?? 1,
      }, "array");
    case "get-branch":
      return getPlan(`${repoPath(values)}/branches/${pathSegment(requiredString(firstValue(values.branch, values.branchName), "branch"))}`, auth, headers, {}, ["name", "commit"]);
    case "get-repository-content":
      return getPlan(`${repoPath(values)}/contents/${pathSegment(requiredString(values.path, "path"))}`, auth, headers, {
        ref: values.ref,
      }, ["name", "path", "sha"]);
    case "create-or-update-file":
      return putPlan(`${repoPath(values)}/contents/${pathSegment(requiredString(values.path, "path"))}`, auth, headers, removeEmptyValues({
        message: requiredString(values.message, "message"),
        content: requiredString(values.content, "content"),
        sha: values.sha,
        branch: values.branch,
        committer: values.committer,
        author: values.author,
      }), ["content", "commit"]);
    case "delete-file":
      return deletePlan(`${repoPath(values)}/contents/${pathSegment(requiredString(values.path, "path"))}`, auth, headers, {
        message: requiredString(values.message, "message"),
        sha: requiredString(values.sha, "sha"),
        branch: values.branch,
        committer: values.committer,
        author: values.author,
      }, ["content", "commit"]);
    case "get-issue":
      return getPlan(`${repoPath(values)}/issues/${issueNumber(values)}`, auth, headers, {}, ["id", "number", "title"]);
    case "list-repository-issues":
      return getPagedPlan(`${repoPath(values)}/issues`, auth, headers, {
        state: values.state ?? "open",
        labels: values.labels,
        sort: values.sort,
        direction: values.direction,
        since: values.since,
        per_page: values.perPage ?? values.per_page ?? 30,
        page: values.page ?? 1,
      }, "array");
    case "create-issue":
      return postPlan(`${repoPath(values)}/issues`, auth, headers, removeEmptyValues({
        title: requiredString(values.title, "title"),
        body: values.body,
        assignees: values.assignees,
        labels: values.labels,
        milestone: values.milestone,
      }), ["id", "number", "title"]);
    case "update-issue":
      return patchPlan(`${repoPath(values)}/issues/${issueNumber(values)}`, auth, headers, removeEmptyValues({
        title: values.title,
        body: values.body,
        assignees: values.assignees,
        state: values.state,
        labels: values.labels,
        milestone: values.milestone,
      }), ["id", "number", "title"]);
    case "lock-issue":
      return putPlan(`${repoPath(values)}/issues/${issueNumber(values)}/lock`, auth, headers, removeEmptyValues({
        lock_reason: firstValue(values.lockReason, values.lock_reason),
      }), []);
    case "unlock-issue":
      return deletePlan(`${repoPath(values)}/issues/${issueNumber(values)}/lock`, auth, headers);
    case "list-issue-comments":
      return getPagedPlan(`${repoPath(values)}/issues/${issueNumber(values)}/comments`, auth, headers, {
        since: values.since,
        per_page: values.perPage ?? values.per_page ?? 30,
        page: values.page ?? 1,
      }, "array");
    case "create-issue-comment":
      return postPlan(`${repoPath(values)}/issues/${issueNumber(values)}/comments`, auth, headers, {
        body: requiredString(values.body, "body"),
      }, ["id", "body"]);
    case "update-issue-comment":
      return patchPlan(`${repoPath(values)}/issues/comments/${pathSegment(requiredNumberString(firstValue(values.commentId, values.comment_id), "commentId"))}`, auth, headers, {
        body: requiredString(values.body, "body"),
      }, ["id", "body"]);
    case "delete-issue-comment":
      return deletePlan(`${repoPath(values)}/issues/comments/${pathSegment(requiredNumberString(firstValue(values.commentId, values.comment_id), "commentId"))}`, auth, headers);
    case "list-labels":
      return getPagedPlan(`${repoPath(values)}/labels`, auth, headers, {
        per_page: values.perPage ?? values.per_page ?? 30,
        page: values.page ?? 1,
      }, "array");
    case "create-label":
      return postPlan(`${repoPath(values)}/labels`, auth, headers, labelBody(values, true), ["id", "name", "color"]);
    case "update-label":
      return patchPlan(`${repoPath(values)}/labels/${pathSegment(requiredString(firstValue(values.name, values.label), "name"))}`, auth, headers, labelBody(values, false), ["id", "name", "color"]);
    case "delete-label":
      return deletePlan(`${repoPath(values)}/labels/${pathSegment(requiredString(firstValue(values.name, values.label), "name"))}`, auth, headers);
    case "list-milestones":
      return getPagedPlan(`${repoPath(values)}/milestones`, auth, headers, {
        state: values.state ?? "open",
        sort: values.sort,
        direction: values.direction,
        per_page: values.perPage ?? values.per_page ?? 30,
        page: values.page ?? 1,
      }, "array");
    case "create-milestone":
      return postPlan(`${repoPath(values)}/milestones`, auth, headers, milestoneBody(values, true), ["id", "number", "title"]);
    case "update-milestone":
      return patchPlan(`${repoPath(values)}/milestones/${pathSegment(requiredNumberString(firstValue(values.milestoneNumber, values.milestone_number), "milestoneNumber"))}`, auth, headers, milestoneBody(values, false), ["id", "number", "title"]);
    case "delete-milestone":
      return deletePlan(`${repoPath(values)}/milestones/${pathSegment(requiredNumberString(firstValue(values.milestoneNumber, values.milestone_number), "milestoneNumber"))}`, auth, headers);
    case "list-pull-requests":
      return getPagedPlan(`${repoPath(values)}/pulls`, auth, headers, {
        state: values.state ?? "open",
        head: values.head,
        base: values.base,
        sort: values.sort,
        direction: values.direction,
        per_page: values.perPage ?? values.per_page ?? 30,
        page: values.page ?? 1,
      }, "array");
    case "get-pull-request":
      return getPlan(`${repoPath(values)}/pulls/${pullNumber(values)}`, auth, headers, {}, ["id", "number", "title"]);
    case "create-pull-request":
      return postPlan(`${repoPath(values)}/pulls`, auth, headers, removeEmptyValues({
        title: requiredString(values.title, "title"),
        head: requiredString(values.head, "head"),
        base: requiredString(values.base, "base"),
        body: values.body,
        maintainer_can_modify: firstValue(values.maintainerCanModify, values.maintainer_can_modify),
        draft: values.draft,
      }), ["id", "number", "title"]);
    case "update-pull-request":
      return patchPlan(`${repoPath(values)}/pulls/${pullNumber(values)}`, auth, headers, removeEmptyValues({
        title: values.title,
        body: values.body,
        state: values.state,
        base: values.base,
        maintainer_can_modify: firstValue(values.maintainerCanModify, values.maintainer_can_modify),
      }), ["id", "number", "title"]);
    case "merge-pull-request":
      return putPlan(`${repoPath(values)}/pulls/${pullNumber(values)}/merge`, auth, headers, removeEmptyValues({
        commit_title: firstValue(values.commitTitle, values.commit_title),
        commit_message: firstValue(values.commitMessage, values.commit_message),
        sha: values.sha,
        merge_method: firstValue(values.mergeMethod, values.merge_method),
      }), ["merged", "message"]);
    case "list-pull-request-files":
      return getPagedPlan(`${repoPath(values)}/pulls/${pullNumber(values)}/files`, auth, headers, {
        per_page: values.perPage ?? values.per_page ?? 30,
        page: values.page ?? 1,
      }, "array");
    case "list-pull-request-commits":
      return getPagedPlan(`${repoPath(values)}/pulls/${pullNumber(values)}/commits`, auth, headers, {
        per_page: values.perPage ?? values.per_page ?? 30,
        page: values.page ?? 1,
      }, "array");
    case "list-releases":
      return getPagedPlan(`${repoPath(values)}/releases`, auth, headers, {
        per_page: values.perPage ?? values.per_page ?? 30,
        page: values.page ?? 1,
      }, "array");
    case "get-release":
      return getPlan(`${repoPath(values)}/releases/${pathSegment(requiredNumberString(firstValue(values.releaseId, values.release_id), "releaseId"))}`, auth, headers, {}, ["id", "tag_name"]);
    case "create-release":
      return postPlan(`${repoPath(values)}/releases`, auth, headers, releaseBody(values, true), ["id", "tag_name"]);
    case "update-release":
      return patchPlan(`${repoPath(values)}/releases/${pathSegment(requiredNumberString(firstValue(values.releaseId, values.release_id), "releaseId"))}`, auth, headers, releaseBody(values, false), ["id", "tag_name"]);
    case "delete-release":
      return deletePlan(`${repoPath(values)}/releases/${pathSegment(requiredNumberString(firstValue(values.releaseId, values.release_id), "releaseId"))}`, auth, headers);
    case "list-workflows":
      return getPlan(`${repoPath(values)}/actions/workflows`, auth, headers, {
        per_page: values.perPage ?? values.per_page,
        page: values.page,
      }, ["total_count", "workflows"]);
    case "get-workflow":
      return getPlan(`${repoPath(values)}/actions/workflows/${pathSegment(requiredString(firstValue(values.workflowId, values.workflow_id, values.workflowFileName), "workflowId"))}`, auth, headers, {}, ["id", "name", "state"]);
    case "dispatch-workflow":
      return postPlan(`${repoPath(values)}/actions/workflows/${pathSegment(requiredString(firstValue(values.workflowId, values.workflow_id, values.workflowFileName), "workflowId"))}/dispatches`, auth, headers, {
        ref: requiredString(values.ref, "ref"),
        inputs: values.inputs,
      }, []);
    case "list-workflow-runs":
      return getPlan(`${repoPath(values)}/actions/runs`, auth, headers, {
        actor: values.actor,
        branch: values.branch,
        event: values.event,
        status: values.status,
        per_page: values.perPage ?? values.per_page,
        page: values.page,
      }, ["total_count", "workflow_runs"]);
    case "get-workflow-run":
      return getPlan(`${repoPath(values)}/actions/runs/${pathSegment(requiredNumberString(firstValue(values.runId, values.run_id), "runId"))}`, auth, headers, {}, ["id", "status"]);
    case "rerun-workflow-run":
      return postPlan(`${repoPath(values)}/actions/runs/${pathSegment(requiredNumberString(firstValue(values.runId, values.run_id), "runId"))}/rerun`, auth, headers, {}, []);
    case "cancel-workflow-run":
      return postPlan(`${repoPath(values)}/actions/runs/${pathSegment(requiredNumberString(firstValue(values.runId, values.run_id), "runId"))}/cancel`, auth, headers, {}, []);
    case "list-repository-webhooks":
      return getPagedPlan(`${repoPath(values)}/hooks`, auth, headers, {
        per_page: values.perPage ?? values.per_page ?? 30,
        page: values.page ?? 1,
      }, "array");
    case "get-repository-webhook":
      return getPlan(`${repoPath(values)}/hooks/${pathSegment(requiredNumberString(firstValue(values.hookId, values.hook_id), "hookId"))}`, auth, headers, {}, ["id", "name", "active"]);
    case "create-repository-webhook":
      return postPlan(`${repoPath(values)}/hooks`, auth, headers, removeEmptyValues({
        name: values.name ?? "web",
        active: values.active ?? true,
        events: values.events,
        config: requiredJson(values.config, "config"),
      }), ["id", "name", "active"]);
    case "delete-repository-webhook":
      return deletePlan(`${repoPath(values)}/hooks/${pathSegment(requiredNumberString(firstValue(values.hookId, values.hook_id), "hookId"))}`, auth, headers);
    case "ping-repository-webhook":
      return postPlan(`${repoPath(values)}/hooks/${pathSegment(requiredNumberString(firstValue(values.hookId, values.hook_id), "hookId"))}/pings`, auth, headers, {}, []);
    case "list-gists":
      return getPagedPlan("gists", auth, headers, {
        since: values.since,
        per_page: values.perPage ?? values.per_page ?? 30,
        page: values.page ?? 1,
      }, "array");
    case "get-gist":
      return getPlan(`gists/${pathSegment(requiredString(firstValue(values.gistId, values.gist_id), "gistId"))}`, auth, headers, {}, ["id", "files"]);
    case "create-gist":
      return postPlan("gists", auth, headers, removeEmptyValues({
        description: values.description,
        public: values.public,
        files: requiredJson(values.files, "files"),
      }), ["id", "files"]);
    case "update-gist":
      return patchPlan(`gists/${pathSegment(requiredString(firstValue(values.gistId, values.gist_id), "gistId"))}`, auth, headers, removeEmptyValues({
        description: values.description,
        files: values.files,
      }), ["id", "files"]);
    case "delete-gist":
      return deletePlan(`gists/${pathSegment(requiredString(firstValue(values.gistId, values.gist_id), "gistId"))}`, auth, headers);
  }
}

function gitHubRuntimeOperation(operationId: string): GitHubRuntimeOperation | null {
  const slug = operationId.split(".").at(-1);
  if (slug === "get-authenticated-user" || slug === "get-current-user") return "get-authenticated-user";
  if (slug === "get-user") return "get-user";
  if (slug === "list-user-repositories") return "list-user-repositories";
  if (slug === "list-org-repositories") return "list-org-repositories";
  if (slug === "create-user-repository") return "create-user-repository";
  if (slug === "create-org-repository") return "create-org-repository";
  if (slug === "get-repository") return "get-repository";
  if (slug === "update-repository") return "update-repository";
  if (slug === "delete-repository") return "delete-repository";
  if (slug === "list-branches") return "list-branches";
  if (slug === "get-branch") return "get-branch";
  if (slug === "get-repository-content") return "get-repository-content";
  if (slug === "create-or-update-file") return "create-or-update-file";
  if (slug === "delete-file") return "delete-file";
  if (slug === "get-issue" || slug === "find-issue") return "get-issue";
  if (slug === "list-repository-issues" || slug === "list-issues") return "list-repository-issues";
  if (slug === "create-issue" || slug === "open-issue") return "create-issue";
  if (slug === "update-issue") return "update-issue";
  if (slug === "lock-issue") return "lock-issue";
  if (slug === "unlock-issue") return "unlock-issue";
  if (slug === "list-issue-comments") return "list-issue-comments";
  if (slug === "create-issue-comment" || slug === "add-comment") return "create-issue-comment";
  if (slug === "update-issue-comment") return "update-issue-comment";
  if (slug === "delete-issue-comment") return "delete-issue-comment";
  if (slug === "list-labels") return "list-labels";
  if (slug === "create-label") return "create-label";
  if (slug === "update-label") return "update-label";
  if (slug === "delete-label") return "delete-label";
  if (slug === "list-milestones") return "list-milestones";
  if (slug === "create-milestone") return "create-milestone";
  if (slug === "update-milestone") return "update-milestone";
  if (slug === "delete-milestone") return "delete-milestone";
  if (slug === "list-pull-requests") return "list-pull-requests";
  if (slug === "get-pull-request") return "get-pull-request";
  if (slug === "create-pull-request") return "create-pull-request";
  if (slug === "update-pull-request") return "update-pull-request";
  if (slug === "merge-pull-request") return "merge-pull-request";
  if (slug === "list-pull-request-files") return "list-pull-request-files";
  if (slug === "list-pull-request-commits") return "list-pull-request-commits";
  if (slug === "list-releases") return "list-releases";
  if (slug === "get-release") return "get-release";
  if (slug === "create-release") return "create-release";
  if (slug === "update-release") return "update-release";
  if (slug === "delete-release") return "delete-release";
  if (slug === "list-workflows") return "list-workflows";
  if (slug === "get-workflow") return "get-workflow";
  if (slug === "dispatch-workflow") return "dispatch-workflow";
  if (slug === "list-workflow-runs") return "list-workflow-runs";
  if (slug === "get-workflow-run") return "get-workflow-run";
  if (slug === "rerun-workflow-run") return "rerun-workflow-run";
  if (slug === "cancel-workflow-run") return "cancel-workflow-run";
  if (slug === "list-repository-webhooks") return "list-repository-webhooks";
  if (slug === "get-repository-webhook") return "get-repository-webhook";
  if (slug === "create-repository-webhook") return "create-repository-webhook";
  if (slug === "delete-repository-webhook") return "delete-repository-webhook";
  if (slug === "ping-repository-webhook") return "ping-repository-webhook";
  if (slug === "list-gists") return "list-gists";
  if (slug === "get-gist") return "get-gist";
  if (slug === "create-gist") return "create-gist";
  if (slug === "update-gist") return "update-gist";
  if (slug === "delete-gist") return "delete-gist";
  return null;
}

function getPlan(
  endpoint: string,
  auth: ConnectorRuntimeRequestPlan["auth"],
  headers: Record<string, string>,
  query: Record<string, IntegrationJson | undefined>,
  requiredPaths: string[],
  type: ConnectorRuntimeRequestPlan["responseSchema"]["type"] = "object",
): ConnectorRuntimeRequestPlan {
  return {
    method: "GET",
    endpoint,
    auth,
    headers,
    query: removeEmptyValues(query),
    body: {},
    responseSchema: {
      type,
      ...(requiredPaths.length ? { requiredPaths } : {}),
    },
  };
}

function getPagedPlan(
  endpoint: string,
  auth: ConnectorRuntimeRequestPlan["auth"],
  headers: Record<string, string>,
  query: Record<string, IntegrationJson | undefined>,
  type: ConnectorRuntimeRequestPlan["responseSchema"]["type"],
): ConnectorRuntimeRequestPlan {
  const perPage = numberValue(query.per_page) ?? 30;
  return {
    ...getPlan(endpoint, auth, headers, query, [], type),
    pagination: {
      mode: "offset",
      itemsPath: type === "array" ? "" : undefined,
      offsetParam: "page",
      limitParam: "per_page",
      pageSize: perPage,
      maxPages: numberValue(query.maxPages) ?? 1,
    },
  };
}

function postPlan(
  endpoint: string,
  auth: ConnectorRuntimeRequestPlan["auth"],
  headers: Record<string, string>,
  body: Record<string, IntegrationJson | undefined>,
  requiredPaths: string[],
): ConnectorRuntimeRequestPlan {
  return bodyPlan("POST", endpoint, auth, headers, body, requiredPaths);
}

function patchPlan(
  endpoint: string,
  auth: ConnectorRuntimeRequestPlan["auth"],
  headers: Record<string, string>,
  body: Record<string, IntegrationJson | undefined>,
  requiredPaths: string[],
): ConnectorRuntimeRequestPlan {
  return bodyPlan("PATCH", endpoint, auth, headers, body, requiredPaths);
}

function putPlan(
  endpoint: string,
  auth: ConnectorRuntimeRequestPlan["auth"],
  headers: Record<string, string>,
  body: Record<string, IntegrationJson | undefined>,
  requiredPaths: string[],
): ConnectorRuntimeRequestPlan {
  return bodyPlan("PUT", endpoint, auth, headers, body, requiredPaths);
}

function deletePlan(
  endpoint: string,
  auth: ConnectorRuntimeRequestPlan["auth"],
  headers: Record<string, string>,
  body: Record<string, IntegrationJson | undefined> = {},
  requiredPaths: string[] = [],
): ConnectorRuntimeRequestPlan {
  return bodyPlan("DELETE", endpoint, auth, headers, body, requiredPaths);
}

function bodyPlan(
  method: string,
  endpoint: string,
  auth: ConnectorRuntimeRequestPlan["auth"],
  headers: Record<string, string>,
  body: Record<string, IntegrationJson | undefined>,
  requiredPaths: string[],
): ConnectorRuntimeRequestPlan {
  return {
    method,
    endpoint,
    auth,
    headers,
    body: removeEmptyValues(body),
    responseSchema: {
      type: "object",
      ...(requiredPaths.length ? { requiredPaths } : {}),
    },
  };
}

function repoPath(values: Record<string, IntegrationJson>): string {
  const owner = pathSegment(requiredString(firstValue(values.owner, values.repositoryOwner), "owner"));
  const repo = pathSegment(requiredString(firstValue(values.repo, values.repository), "repo"));
  return `repos/${owner}/${repo}`;
}

function issueNumber(values: Record<string, IntegrationJson>): string {
  return pathSegment(requiredNumberString(firstValue(values.issueNumber, values.issue_number), "issueNumber"));
}

function pullNumber(values: Record<string, IntegrationJson>): string {
  return pathSegment(requiredNumberString(firstValue(values.pullNumber, values.pull_number), "pullNumber"));
}

function repositoryBody(values: Record<string, IntegrationJson>, requireName: boolean): Record<string, IntegrationJson | undefined> {
  return removeEmptyValues({
    name: requireName ? requiredString(values.name, "name") : values.name,
    description: values.description,
    homepage: values.homepage,
    private: values.private,
    visibility: values.visibility,
    has_issues: firstValue(values.hasIssues, values.has_issues),
    has_projects: firstValue(values.hasProjects, values.has_projects),
    has_wiki: firstValue(values.hasWiki, values.has_wiki),
    default_branch: firstValue(values.defaultBranch, values.default_branch),
  });
}

function labelBody(values: Record<string, IntegrationJson>, requireName: boolean): Record<string, IntegrationJson | undefined> {
  return removeEmptyValues({
    name: requireName ? requiredString(firstValue(values.name, values.label), "name") : firstValue(values.newName, values.name),
    color: requireName ? requiredString(values.color, "color") : values.color,
    description: values.description,
  });
}

function milestoneBody(values: Record<string, IntegrationJson>, requireTitle: boolean): Record<string, IntegrationJson | undefined> {
  return removeEmptyValues({
    title: requireTitle ? requiredString(values.title, "title") : values.title,
    state: values.state,
    description: values.description,
    due_on: firstValue(values.dueOn, values.due_on),
  });
}

function releaseBody(values: Record<string, IntegrationJson>, requireTag: boolean): Record<string, IntegrationJson | undefined> {
  return removeEmptyValues({
    tag_name: requireTag ? requiredString(firstValue(values.tagName, values.tag_name), "tagName") : firstValue(values.tagName, values.tag_name),
    target_commitish: firstValue(values.targetCommitish, values.target_commitish),
    name: values.name,
    body: values.body,
    draft: values.draft,
    prerelease: values.prerelease,
    generate_release_notes: firstValue(values.generateReleaseNotes, values.generate_release_notes),
  });
}

function firstValue(...values: Array<IntegrationJson | undefined>): IntegrationJson {
  return values.find((value) => value != null && value !== "") ?? null;
}

function requiredString(value: IntegrationJson | undefined, name: string): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  throw new Error(`GitHub ${name} is required`);
}

function requiredNumberString(value: IntegrationJson | undefined, name: string): string {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return String(value);
  if (typeof value === "string" && /^[1-9]\d*$/.test(value.trim())) return value.trim();
  throw new Error(`GitHub ${name} must be a positive integer`);
}

function requiredJson(value: IntegrationJson | undefined, name: string): IntegrationJson {
  if (value == null || value === "") throw new Error(`GitHub ${name} is required`);
  return value;
}

function pathSegment(value: string): string {
  return encodeURIComponent(value);
}

function numberValue(value: IntegrationJson | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function removeEmptyValues(input: Record<string, IntegrationJson | undefined>): Record<string, IntegrationJson> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value != null && value !== ""),
  ) as Record<string, IntegrationJson>;
}
