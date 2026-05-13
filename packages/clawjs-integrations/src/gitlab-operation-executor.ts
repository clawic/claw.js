import type {
  ConnectorRuntimeRequestPlan,
} from "./runtime-registry.ts";
import type {
  ConnectorFieldDefinition,
  ConnectorOperationDefinition,
  IntegrationJson,
} from "./types.ts";

export type GitLabRuntimeOperation =
  | "get-current-user"
  | "get-user"
  | "list-users"
  | "list-projects"
  | "get-project"
  | "create-project"
  | "update-project"
  | "delete-project"
  | "archive-project"
  | "unarchive-project"
  | "star-project"
  | "unstar-project"
  | "fork-project"
  | "list-groups"
  | "get-group"
  | "create-group"
  | "update-group"
  | "delete-group"
  | "list-group-projects"
  | "list-project-issues"
  | "get-project-issue"
  | "create-issue"
  | "update-issue"
  | "delete-issue"
  | "list-issue-notes"
  | "create-issue-note"
  | "update-issue-note"
  | "delete-issue-note"
  | "list-project-merge-requests"
  | "get-merge-request"
  | "create-merge-request"
  | "update-merge-request"
  | "merge-merge-request"
  | "delete-merge-request"
  | "list-merge-request-notes"
  | "create-merge-request-note"
  | "update-merge-request-note"
  | "delete-merge-request-note"
  | "list-branches"
  | "get-branch"
  | "create-branch"
  | "delete-branch"
  | "protect-branch"
  | "unprotect-branch"
  | "list-tags"
  | "get-tag"
  | "create-tag"
  | "delete-tag"
  | "list-repository-tree"
  | "get-repository-file"
  | "create-repository-file"
  | "update-repository-file"
  | "delete-repository-file"
  | "list-commits"
  | "get-commit"
  | "create-commit"
  | "cherry-pick-commit"
  | "revert-commit"
  | "list-pipelines"
  | "get-pipeline"
  | "create-pipeline"
  | "retry-pipeline"
  | "cancel-pipeline"
  | "delete-pipeline"
  | "list-jobs"
  | "get-job"
  | "retry-job"
  | "cancel-job"
  | "erase-job"
  | "play-job"
  | "list-releases"
  | "get-release"
  | "create-release"
  | "update-release"
  | "delete-release"
  | "list-labels"
  | "create-label"
  | "update-label"
  | "delete-label"
  | "list-milestones"
  | "get-milestone"
  | "create-milestone"
  | "update-milestone"
  | "delete-milestone"
  | "list-project-members"
  | "add-project-member"
  | "update-project-member"
  | "remove-project-member"
  | "list-project-hooks"
  | "get-project-hook"
  | "create-project-hook"
  | "update-project-hook"
  | "delete-project-hook"
  | "list-project-variables"
  | "get-project-variable"
  | "create-project-variable"
  | "update-project-variable"
  | "delete-project-variable"
  | "list-commit-comments"
  | "create-commit-comment"
  | "list-commit-statuses"
  | "create-commit-status"
  | "compare-refs"
  | "list-repository-contributors"
  | "get-repository-blob"
  | "get-raw-blob"
  | "search-project-blobs"
  | "search-project-commits"
  | "search-project-issues"
  | "search-project-merge-requests"
  | "search-project-users"
  | "list-issue-discussions"
  | "create-issue-discussion"
  | "update-issue-discussion-note"
  | "delete-issue-discussion-note"
  | "list-merge-request-discussions"
  | "create-merge-request-discussion"
  | "update-merge-request-discussion-note"
  | "delete-merge-request-discussion-note"
  | "get-merge-request-approvals"
  | "approve-merge-request"
  | "unapprove-merge-request"
  | "update-merge-request-approvals"
  | "list-environments"
  | "get-environment"
  | "create-environment"
  | "update-environment"
  | "delete-environment"
  | "stop-environment"
  | "list-deployments"
  | "get-deployment"
  | "create-deployment"
  | "delete-deployment"
  | "list-group-members"
  | "add-group-member"
  | "update-group-member"
  | "remove-group-member"
  | "list-project-badges"
  | "add-project-badge"
  | "update-project-badge"
  | "delete-project-badge";

type GitLabField = ConnectorFieldDefinition;

interface GitLabGenericOperationSpec {
  slug: GitLabRuntimeOperation;
  method: string;
  endpoint: string;
  fields: GitLabField[];
  response: "array" | "object";
  requiredPaths?: string[];
  query?: string[];
  queryDefaults?: Record<string, IntegrationJson>;
  body?: string[];
  paginated?: boolean;
}

export const GITLAB_EXTRA_ACTION_SPECS = [
  spec("list-commit-comments", "GET", "projects/{projectId}/repository/commits/{sha}/comments", [projectField(), stringField("sha")], "array", { paginated: true }),
  spec("create-commit-comment", "POST", "projects/{projectId}/repository/commits/{sha}/comments", [projectField(), stringField("sha"), stringField("note", "Looks good"), optionalStringField("path", "README.md"), integerField("line", 1, true), optionalStringField("lineType", "new")], "object", { body: ["note", "path", "line", "line_type"] }),
  spec("list-commit-statuses", "GET", "projects/{projectId}/repository/commits/{sha}/statuses", [projectField(), stringField("sha"), optionalStringField("ref", "main"), optionalStringField("name", "ci"), optionalStringField("stage", "test")], "array", { query: ["ref", "name", "stage"], paginated: true }),
  spec("create-commit-status", "POST", "projects/{projectId}/statuses/{sha}", [projectField(), stringField("sha"), stringField("state", "success"), optionalStringField("ref", "main"), optionalStringField("name", "ci"), optionalStringField("targetUrl", "https://example.invalid/build"), optionalStringField("description", "Build passed")], "object", { body: ["state", "ref", "name", "target_url", "description"] }),
  spec("compare-refs", "GET", "projects/{projectId}/repository/compare", [projectField(), stringField("from", "main"), stringField("to", "feature"), booleanField("straight", false, true)], "object", { query: ["from", "to", "straight"] }),
  spec("list-repository-contributors", "GET", "projects/{projectId}/repository/contributors", [projectField()], "array", { paginated: true }),
  spec("get-repository-blob", "GET", "projects/{projectId}/repository/blobs/{sha}", [projectField(), stringField("sha")], "object", { requiredPaths: ["id"] }),
  spec("get-raw-blob", "GET", "projects/{projectId}/repository/blobs/{sha}/raw", [projectField(), stringField("sha")], "object"),
  spec("search-project-blobs", "GET", "projects/{projectId}/search", [projectField(), stringField("search", "runtime")], "array", { query: ["scope", "search"], queryDefaults: { scope: "blobs" }, paginated: true }),
  spec("search-project-commits", "GET", "projects/{projectId}/search", [projectField(), stringField("search", "runtime")], "array", { query: ["scope", "search"], queryDefaults: { scope: "commits" }, paginated: true }),
  spec("search-project-issues", "GET", "projects/{projectId}/search", [projectField(), stringField("search", "runtime")], "array", { query: ["scope", "search"], queryDefaults: { scope: "issues" }, paginated: true }),
  spec("search-project-merge-requests", "GET", "projects/{projectId}/search", [projectField(), stringField("search", "runtime")], "array", { query: ["scope", "search"], queryDefaults: { scope: "merge_requests" }, paginated: true }),
  spec("search-project-users", "GET", "projects/{projectId}/search", [projectField(), stringField("search", "sample")], "array", { query: ["scope", "search"], queryDefaults: { scope: "users" }, paginated: true }),
  spec("list-issue-discussions", "GET", "projects/{projectId}/issues/{issueIid}/discussions", [projectField(), integerField("issueIid")], "array", { paginated: true }),
  spec("create-issue-discussion", "POST", "projects/{projectId}/issues/{issueIid}/discussions", [projectField(), integerField("issueIid"), stringField("body", "Discussion body")], "object", { body: ["body"] }),
  spec("update-issue-discussion-note", "PUT", "projects/{projectId}/issues/{issueIid}/discussions/{discussionId}/notes/{noteId}", [projectField(), integerField("issueIid"), stringField("discussionId", "discussion_1"), integerField("noteId"), stringField("body", "Updated discussion")], "object", { body: ["body"] }),
  spec("delete-issue-discussion-note", "DELETE", "projects/{projectId}/issues/{issueIid}/discussions/{discussionId}/notes/{noteId}", [projectField(), integerField("issueIid"), stringField("discussionId", "discussion_1"), integerField("noteId")], "object"),
  spec("list-merge-request-discussions", "GET", "projects/{projectId}/merge_requests/{mergeRequestIid}/discussions", [projectField(), integerField("mergeRequestIid")], "array", { paginated: true }),
  spec("create-merge-request-discussion", "POST", "projects/{projectId}/merge_requests/{mergeRequestIid}/discussions", [projectField(), integerField("mergeRequestIid"), stringField("body", "Discussion body")], "object", { body: ["body"] }),
  spec("update-merge-request-discussion-note", "PUT", "projects/{projectId}/merge_requests/{mergeRequestIid}/discussions/{discussionId}/notes/{noteId}", [projectField(), integerField("mergeRequestIid"), stringField("discussionId", "discussion_1"), integerField("noteId"), stringField("body", "Updated discussion")], "object", { body: ["body"] }),
  spec("delete-merge-request-discussion-note", "DELETE", "projects/{projectId}/merge_requests/{mergeRequestIid}/discussions/{discussionId}/notes/{noteId}", [projectField(), integerField("mergeRequestIid"), stringField("discussionId", "discussion_1"), integerField("noteId")], "object"),
  spec("get-merge-request-approvals", "GET", "projects/{projectId}/merge_requests/{mergeRequestIid}/approvals", [projectField(), integerField("mergeRequestIid")], "object"),
  spec("approve-merge-request", "POST", "projects/{projectId}/merge_requests/{mergeRequestIid}/approve", [projectField(), integerField("mergeRequestIid"), optionalStringField("sha", "abc123")], "object", { body: ["sha"] }),
  spec("unapprove-merge-request", "POST", "projects/{projectId}/merge_requests/{mergeRequestIid}/unapprove", [projectField(), integerField("mergeRequestIid")], "object"),
  spec("update-merge-request-approvals", "PUT", "projects/{projectId}/merge_requests/{mergeRequestIid}/approvals", [projectField(), integerField("mergeRequestIid"), integerField("approvalsRequired", 1)], "object", { body: ["approvals_required"] }),
  spec("list-environments", "GET", "projects/{projectId}/environments", [projectField(), optionalStringField("search", "production"), optionalStringField("states", "available")], "array", { query: ["search", "states"], paginated: true }),
  spec("get-environment", "GET", "projects/{projectId}/environments/{environmentId}", [projectField(), integerField("environmentId")], "object", { requiredPaths: ["id", "name"] }),
  spec("create-environment", "POST", "projects/{projectId}/environments", [projectField(), stringField("name", "production"), optionalStringField("externalUrl", "https://example.invalid/env"), optionalStringField("tier", "production")], "object", { body: ["name", "external_url", "tier"], requiredPaths: ["id", "name"] }),
  spec("update-environment", "PUT", "projects/{projectId}/environments/{environmentId}", [projectField(), integerField("environmentId"), stringField("name", "production"), optionalStringField("externalUrl", "https://example.invalid/env"), optionalStringField("tier", "production")], "object", { body: ["name", "external_url", "tier"], requiredPaths: ["id", "name"] }),
  spec("delete-environment", "DELETE", "projects/{projectId}/environments/{environmentId}", [projectField(), integerField("environmentId")], "object"),
  spec("stop-environment", "POST", "projects/{projectId}/environments/{environmentId}/stop", [projectField(), integerField("environmentId")], "object", { requiredPaths: ["id", "name"] }),
  spec("list-deployments", "GET", "projects/{projectId}/deployments", [projectField(), optionalStringField("environment", "production"), optionalStringField("status", "success")], "array", { query: ["environment", "status"], paginated: true }),
  spec("get-deployment", "GET", "projects/{projectId}/deployments/{deploymentId}", [projectField(), integerField("deploymentId")], "object", { requiredPaths: ["id"] }),
  spec("create-deployment", "POST", "projects/{projectId}/deployments", [projectField(), stringField("environment", "production"), stringField("sha", "abc123"), optionalStringField("ref", "main"), booleanField("tag", false, true)], "object", { body: ["environment", "sha", "ref", "tag"], requiredPaths: ["id"] }),
  spec("delete-deployment", "DELETE", "projects/{projectId}/deployments/{deploymentId}", [projectField(), integerField("deploymentId")], "object"),
  spec("list-group-members", "GET", "groups/{groupId}/members/all", [groupField(), optionalStringField("query", "sample")], "array", { query: ["query"], paginated: true }),
  spec("add-group-member", "POST", "groups/{groupId}/members", [groupField(), integerField("userId"), integerField("accessLevel", 30), optionalStringField("expiresAt", "2026-12-31")], "object", { body: ["user_id", "access_level", "expires_at"], requiredPaths: ["id", "username"] }),
  spec("update-group-member", "PUT", "groups/{groupId}/members/{userId}", [groupField(), integerField("userId"), integerField("accessLevel", 30), optionalStringField("expiresAt", "2026-12-31")], "object", { body: ["access_level", "expires_at"], requiredPaths: ["id", "username"] }),
  spec("remove-group-member", "DELETE", "groups/{groupId}/members/{userId}", [groupField(), integerField("userId")], "object"),
  spec("list-project-badges", "GET", "projects/{projectId}/badges", [projectField()], "array", { paginated: true }),
  spec("add-project-badge", "POST", "projects/{projectId}/badges", [projectField(), stringField("linkUrl", "https://example.invalid/badge"), stringField("imageUrl", "https://example.invalid/badge.svg"), optionalStringField("name", "coverage")], "object", { body: ["link_url", "image_url", "name"], requiredPaths: ["id"] }),
  spec("update-project-badge", "PUT", "projects/{projectId}/badges/{badgeId}", [projectField(), integerField("badgeId"), stringField("linkUrl", "https://example.invalid/badge"), stringField("imageUrl", "https://example.invalid/badge.svg"), optionalStringField("name", "coverage")], "object", { body: ["link_url", "image_url", "name"], requiredPaths: ["id"] }),
  spec("delete-project-badge", "DELETE", "projects/{projectId}/badges/{badgeId}", [projectField(), integerField("badgeId")], "object"),
] as const satisfies readonly GitLabGenericOperationSpec[];

const GITLAB_EXTRA_SPEC_BY_SLUG = new Map<GitLabRuntimeOperation, GitLabGenericOperationSpec>(
  GITLAB_EXTRA_ACTION_SPECS.map((operation) => [operation.slug, operation]),
);

export function isGitLabActionOperationSupported(operationId: string): boolean {
  return gitLabRuntimeOperation(operationId) !== null;
}

export function buildGitLabOperationRequest(
  operation: ConnectorOperationDefinition,
  values: Record<string, IntegrationJson>,
): ConnectorRuntimeRequestPlan {
  const runtimeOperation = gitLabRuntimeOperation(operation.id);
  if (!runtimeOperation) {
    throw new Error(`Unsupported GitLab operation: ${operation.id}`);
  }
  const auth = operation.authFieldNames.map((field) => ({
    type: "secret" as const,
    field,
    placement: "header" as const,
    name: "PRIVATE-TOKEN",
  }));
  const headers = { accept: "application/json" };

  const genericSpec = GITLAB_EXTRA_SPEC_BY_SLUG.get(runtimeOperation);
  if (genericSpec) return genericGitLabPlan(genericSpec, values, auth, headers);

  switch (runtimeOperation) {
    case "get-current-user":
      return getPlan("user", auth, headers, objectSchema(["id", "username"]));
    case "get-user":
      return getPlan(`users/${numberId(values.userId, "userId")}`, auth, headers, objectSchema(["id", "username"]));
    case "list-users":
      return pagedGetPlan("users", auth, headers, values, arraySchema(), {
        search: optionalString(values.search),
        username: optionalString(values.username),
        active: values.active,
        blocked: values.blocked,
      });
    case "list-projects":
      return pagedGetPlan("projects", auth, headers, values, arraySchema(), {
        search: optionalString(values.search),
        membership: values.membership,
        owned: values.owned,
        archived: values.archived,
        visibility: optionalString(values.visibility),
        order_by: optionalString(firstValue(values.orderBy, values.order_by)),
        sort: optionalString(values.sort),
      });
    case "get-project":
      return getPlan(`projects/${projectId(values)}`, auth, headers, objectSchema(["id", "name"]));
    case "create-project":
      return bodyPlan("POST", "projects", auth, headers, projectBody(values, true), objectSchema(["id", "name"]));
    case "update-project":
      return bodyPlan("PUT", `projects/${projectId(values)}`, auth, headers, projectBody(values, false), objectSchema(["id", "name"]));
    case "delete-project":
      return deletePlan(`projects/${projectId(values)}`, auth, headers);
    case "archive-project":
      return bodyPlan("POST", `projects/${projectId(values)}/archive`, auth, headers, {}, objectSchema(["id", "name"]));
    case "unarchive-project":
      return bodyPlan("POST", `projects/${projectId(values)}/unarchive`, auth, headers, {}, objectSchema(["id", "name"]));
    case "star-project":
      return bodyPlan("POST", `projects/${projectId(values)}/star`, auth, headers, {}, objectSchema(["id", "name"]));
    case "unstar-project":
      return bodyPlan("POST", `projects/${projectId(values)}/unstar`, auth, headers, {}, objectSchema(["id", "name"]));
    case "fork-project":
      return bodyPlan("POST", `projects/${projectId(values)}/fork`, auth, headers, removeEmptyValues({
        namespace_id: values.namespaceId ?? values.namespace_id,
        path: optionalString(values.path),
        name: optionalString(values.name),
      }), objectSchema(["id", "name"]));
    case "list-groups":
      return pagedGetPlan("groups", auth, headers, values, arraySchema(), {
        search: optionalString(values.search),
        owned: values.owned,
        all_available: values.allAvailable ?? values.all_available,
      });
    case "get-group":
      return getPlan(`groups/${groupId(values)}`, auth, headers, objectSchema(["id", "name"]));
    case "create-group":
      return bodyPlan("POST", "groups", auth, headers, groupBody(values, true), objectSchema(["id", "name"]));
    case "update-group":
      return bodyPlan("PUT", `groups/${groupId(values)}`, auth, headers, groupBody(values, false), objectSchema(["id", "name"]));
    case "delete-group":
      return deletePlan(`groups/${groupId(values)}`, auth, headers);
    case "list-group-projects":
      return pagedGetPlan(`groups/${groupId(values)}/projects`, auth, headers, values, arraySchema(), {
        archived: values.archived,
        visibility: optionalString(values.visibility),
        search: optionalString(values.search),
      });
    case "list-project-issues":
      return pagedGetPlan(`projects/${projectId(values)}/issues`, auth, headers, values, arraySchema(), {
        state: values.state ?? "opened",
        labels: values.labels,
        search: values.search,
        scope: values.scope,
        order_by: values.orderBy ?? values.order_by,
        sort: values.sort,
      });
    case "get-project-issue":
      return getPlan(`projects/${projectId(values)}/issues/${issueIid(values)}`, auth, headers, objectSchema(["id", "iid", "title"]));
    case "create-issue":
      return bodyPlan("POST", `projects/${projectId(values)}/issues`, auth, headers, issueBody(values, true), objectSchema(["id", "iid", "title"]));
    case "update-issue":
      return bodyPlan("PUT", `projects/${projectId(values)}/issues/${issueIid(values)}`, auth, headers, issueBody(values, false), objectSchema(["id", "iid", "title"]));
    case "delete-issue":
      return deletePlan(`projects/${projectId(values)}/issues/${issueIid(values)}`, auth, headers);
    case "list-issue-notes":
      return pagedGetPlan(`projects/${projectId(values)}/issues/${issueIid(values)}/notes`, auth, headers, values, arraySchema());
    case "create-issue-note":
      return bodyPlan("POST", `projects/${projectId(values)}/issues/${issueIid(values)}/notes`, auth, headers, noteBody(values, true), objectSchema(["id", "body"]));
    case "update-issue-note":
      return bodyPlan("PUT", `projects/${projectId(values)}/issues/${issueIid(values)}/notes/${noteId(values)}`, auth, headers, noteBody(values, true), objectSchema(["id", "body"]));
    case "delete-issue-note":
      return deletePlan(`projects/${projectId(values)}/issues/${issueIid(values)}/notes/${noteId(values)}`, auth, headers);
    case "list-project-merge-requests":
      return pagedGetPlan(`projects/${projectId(values)}/merge_requests`, auth, headers, values, arraySchema(), {
        state: values.state ?? "opened",
        labels: values.labels,
        search: values.search,
        scope: values.scope,
        order_by: values.orderBy ?? values.order_by,
        sort: values.sort,
      });
    case "get-merge-request":
      return getPlan(`projects/${projectId(values)}/merge_requests/${mergeRequestIid(values)}`, auth, headers, objectSchema(["id", "iid", "title"]));
    case "create-merge-request":
      return bodyPlan("POST", `projects/${projectId(values)}/merge_requests`, auth, headers, mergeRequestBody(values, true), objectSchema(["id", "iid", "title"]));
    case "update-merge-request":
      return bodyPlan("PUT", `projects/${projectId(values)}/merge_requests/${mergeRequestIid(values)}`, auth, headers, mergeRequestBody(values, false), objectSchema(["id", "iid", "title"]));
    case "merge-merge-request":
      return bodyPlan("PUT", `projects/${projectId(values)}/merge_requests/${mergeRequestIid(values)}/merge`, auth, headers, removeEmptyValues({
        merge_commit_message: values.mergeCommitMessage ?? values.merge_commit_message,
        squash_commit_message: values.squashCommitMessage ?? values.squash_commit_message,
        squash: values.squash,
        should_remove_source_branch: values.shouldRemoveSourceBranch ?? values.should_remove_source_branch,
      }), objectSchema(["id", "iid", "title"]));
    case "delete-merge-request":
      return deletePlan(`projects/${projectId(values)}/merge_requests/${mergeRequestIid(values)}`, auth, headers);
    case "list-merge-request-notes":
      return pagedGetPlan(`projects/${projectId(values)}/merge_requests/${mergeRequestIid(values)}/notes`, auth, headers, values, arraySchema());
    case "create-merge-request-note":
      return bodyPlan("POST", `projects/${projectId(values)}/merge_requests/${mergeRequestIid(values)}/notes`, auth, headers, noteBody(values, true), objectSchema(["id", "body"]));
    case "update-merge-request-note":
      return bodyPlan("PUT", `projects/${projectId(values)}/merge_requests/${mergeRequestIid(values)}/notes/${noteId(values)}`, auth, headers, noteBody(values, true), objectSchema(["id", "body"]));
    case "delete-merge-request-note":
      return deletePlan(`projects/${projectId(values)}/merge_requests/${mergeRequestIid(values)}/notes/${noteId(values)}`, auth, headers);
    case "list-branches":
      return pagedGetPlan(`projects/${projectId(values)}/repository/branches`, auth, headers, values, arraySchema(), {
        search: optionalString(values.search),
        regex: optionalString(values.regex),
      });
    case "get-branch":
      return getPlan(`projects/${projectId(values)}/repository/branches/${branchName(values)}`, auth, headers, objectSchema(["name"]));
    case "create-branch":
      return bodyPlan("POST", `projects/${projectId(values)}/repository/branches`, auth, headers, {
        branch: requiredString(values.branch, "branch"),
        ref: requiredString(values.ref, "ref"),
      }, objectSchema(["name"]));
    case "delete-branch":
      return deletePlan(`projects/${projectId(values)}/repository/branches/${branchName(values)}`, auth, headers);
    case "protect-branch":
      return bodyPlan("POST", `projects/${projectId(values)}/protected_branches`, auth, headers, removeEmptyValues({
        name: requiredString(values.branch ?? values.name, "branch"),
        push_access_level: values.pushAccessLevel ?? values.push_access_level,
        merge_access_level: values.mergeAccessLevel ?? values.merge_access_level,
        allow_force_push: values.allowForcePush ?? values.allow_force_push,
        code_owner_approval_required: values.codeOwnerApprovalRequired ?? values.code_owner_approval_required,
      }), objectSchema(["name"]));
    case "unprotect-branch":
      return deletePlan(`projects/${projectId(values)}/protected_branches/${branchName(values)}`, auth, headers);
    case "list-tags":
      return pagedGetPlan(`projects/${projectId(values)}/repository/tags`, auth, headers, values, arraySchema(), {
        search: optionalString(values.search),
        order_by: values.orderBy ?? values.order_by,
        sort: values.sort,
      });
    case "get-tag":
      return getPlan(`projects/${projectId(values)}/repository/tags/${tagName(values)}`, auth, headers, objectSchema(["name"]));
    case "create-tag":
      return bodyPlan("POST", `projects/${projectId(values)}/repository/tags`, auth, headers, removeEmptyValues({
        tag_name: requiredString(values.tagName ?? values.tag_name, "tagName"),
        ref: requiredString(values.ref, "ref"),
        message: optionalString(values.message),
      }), objectSchema(["name"]));
    case "delete-tag":
      return deletePlan(`projects/${projectId(values)}/repository/tags/${tagName(values)}`, auth, headers);
    case "list-repository-tree":
      return pagedGetPlan(`projects/${projectId(values)}/repository/tree`, auth, headers, values, arraySchema(), {
        path: optionalString(values.path),
        ref: optionalString(values.ref),
        recursive: values.recursive,
      });
    case "get-repository-file":
      return getPlan(`projects/${projectId(values)}/repository/files/${filePath(values)}`, auth, headers, objectSchema(["file_path", "content"]), {
        ref: requiredString(values.ref, "ref"),
      });
    case "create-repository-file":
      return bodyPlan("POST", `projects/${projectId(values)}/repository/files/${filePath(values)}`, auth, headers, repositoryFileBody(values, true), objectSchema(["file_path", "branch"]));
    case "update-repository-file":
      return bodyPlan("PUT", `projects/${projectId(values)}/repository/files/${filePath(values)}`, auth, headers, repositoryFileBody(values, true), objectSchema(["file_path", "branch"]));
    case "delete-repository-file":
      return bodyPlan("DELETE", `projects/${projectId(values)}/repository/files/${filePath(values)}`, auth, headers, removeEmptyValues({
        branch: requiredString(values.branch, "branch"),
        commit_message: requiredString(values.commitMessage ?? values.commit_message, "commitMessage"),
        author_email: values.authorEmail ?? values.author_email,
        author_name: values.authorName ?? values.author_name,
      }), objectSchema());
    case "list-commits":
      return pagedGetPlan(`projects/${projectId(values)}/repository/commits`, auth, headers, values, arraySchema(), {
        ref_name: values.refName ?? values.ref_name,
        since: values.since,
        until: values.until,
        path: values.path,
      });
    case "get-commit":
      return getPlan(`projects/${projectId(values)}/repository/commits/${commitSha(values)}`, auth, headers, objectSchema(["id", "short_id", "title"]));
    case "create-commit":
      return bodyPlan("POST", `projects/${projectId(values)}/repository/commits`, auth, headers, {
        branch: requiredString(values.branch, "branch"),
        commit_message: requiredString(values.commitMessage ?? values.commit_message, "commitMessage"),
        actions: requiredJsonArray(values.actions, "actions"),
      }, objectSchema(["id", "short_id", "title"]));
    case "cherry-pick-commit":
      return bodyPlan("POST", `projects/${projectId(values)}/repository/commits/${commitSha(values)}/cherry_pick`, auth, headers, {
        branch: requiredString(values.branch, "branch"),
      }, objectSchema(["id", "short_id", "title"]));
    case "revert-commit":
      return bodyPlan("POST", `projects/${projectId(values)}/repository/commits/${commitSha(values)}/revert`, auth, headers, {
        branch: requiredString(values.branch, "branch"),
      }, objectSchema(["id", "short_id", "title"]));
    case "list-pipelines":
      return pagedGetPlan(`projects/${projectId(values)}/pipelines`, auth, headers, values, arraySchema(), {
        ref: optionalString(values.ref),
        status: optionalString(values.status),
        source: optionalString(values.source),
      });
    case "get-pipeline":
      return getPlan(`projects/${projectId(values)}/pipelines/${pipelineId(values)}`, auth, headers, objectSchema(["id", "status"]));
    case "create-pipeline":
      return bodyPlan("POST", `projects/${projectId(values)}/pipeline`, auth, headers, removeEmptyValues({
        ref: requiredString(values.ref, "ref"),
        variables: optionalJsonArray(values.variables),
      }), objectSchema(["id", "status"]));
    case "retry-pipeline":
      return bodyPlan("POST", `projects/${projectId(values)}/pipelines/${pipelineId(values)}/retry`, auth, headers, {}, objectSchema(["id", "status"]));
    case "cancel-pipeline":
      return bodyPlan("POST", `projects/${projectId(values)}/pipelines/${pipelineId(values)}/cancel`, auth, headers, {}, objectSchema(["id", "status"]));
    case "delete-pipeline":
      return deletePlan(`projects/${projectId(values)}/pipelines/${pipelineId(values)}`, auth, headers);
    case "list-jobs":
      return pagedGetPlan(`projects/${projectId(values)}/jobs`, auth, headers, values, arraySchema(), {
        scope: values.scope,
      });
    case "get-job":
      return getPlan(`projects/${projectId(values)}/jobs/${jobId(values)}`, auth, headers, objectSchema(["id", "status"]));
    case "retry-job":
      return bodyPlan("POST", `projects/${projectId(values)}/jobs/${jobId(values)}/retry`, auth, headers, {}, objectSchema(["id", "status"]));
    case "cancel-job":
      return bodyPlan("POST", `projects/${projectId(values)}/jobs/${jobId(values)}/cancel`, auth, headers, {}, objectSchema(["id", "status"]));
    case "erase-job":
      return bodyPlan("POST", `projects/${projectId(values)}/jobs/${jobId(values)}/erase`, auth, headers, {}, objectSchema(["id", "status"]));
    case "play-job":
      return bodyPlan("POST", `projects/${projectId(values)}/jobs/${jobId(values)}/play`, auth, headers, {}, objectSchema(["id", "status"]));
    case "list-releases":
      return pagedGetPlan(`projects/${projectId(values)}/releases`, auth, headers, values, arraySchema(), {
        order_by: values.orderBy ?? values.order_by,
        sort: values.sort,
      });
    case "get-release":
      return getPlan(`projects/${projectId(values)}/releases/${tagName(values)}`, auth, headers, objectSchema(["tag_name", "name"]));
    case "create-release":
      return bodyPlan("POST", `projects/${projectId(values)}/releases`, auth, headers, releaseBody(values, true), objectSchema(["tag_name", "name"]));
    case "update-release":
      return bodyPlan("PUT", `projects/${projectId(values)}/releases/${tagName(values)}`, auth, headers, releaseBody(values, false), objectSchema(["tag_name", "name"]));
    case "delete-release":
      return deletePlan(`projects/${projectId(values)}/releases/${tagName(values)}`, auth, headers);
    case "list-labels":
      return pagedGetPlan(`projects/${projectId(values)}/labels`, auth, headers, values, arraySchema(), {
        search: optionalString(values.search),
      });
    case "create-label":
      return bodyPlan("POST", `projects/${projectId(values)}/labels`, auth, headers, labelBody(values, true), objectSchema(["name"]));
    case "update-label":
      return bodyPlan("PUT", `projects/${projectId(values)}/labels/${pathSegment(requiredString(values.name, "name"))}`, auth, headers, labelBody(values, false), objectSchema(["name"]));
    case "delete-label":
      return deletePlan(`projects/${projectId(values)}/labels/${pathSegment(requiredString(values.name, "name"))}`, auth, headers);
    case "list-milestones":
      return pagedGetPlan(`projects/${projectId(values)}/milestones`, auth, headers, values, arraySchema(), {
        state: optionalString(values.state),
        search: optionalString(values.search),
      });
    case "get-milestone":
      return getPlan(`projects/${projectId(values)}/milestones/${milestoneId(values)}`, auth, headers, objectSchema(["id", "title"]));
    case "create-milestone":
      return bodyPlan("POST", `projects/${projectId(values)}/milestones`, auth, headers, milestoneBody(values, true), objectSchema(["id", "title"]));
    case "update-milestone":
      return bodyPlan("PUT", `projects/${projectId(values)}/milestones/${milestoneId(values)}`, auth, headers, milestoneBody(values, false), objectSchema(["id", "title"]));
    case "delete-milestone":
      return deletePlan(`projects/${projectId(values)}/milestones/${milestoneId(values)}`, auth, headers);
    case "list-project-members":
      return pagedGetPlan(`projects/${projectId(values)}/members/all`, auth, headers, values, arraySchema(), {
        query: optionalString(values.query),
      });
    case "add-project-member":
      return bodyPlan("POST", `projects/${projectId(values)}/members`, auth, headers, memberBody(values, true), objectSchema(["id", "username"]));
    case "update-project-member":
      return bodyPlan("PUT", `projects/${projectId(values)}/members/${userId(values)}`, auth, headers, memberBody(values, false), objectSchema(["id", "username"]));
    case "remove-project-member":
      return deletePlan(`projects/${projectId(values)}/members/${userId(values)}`, auth, headers);
    case "list-project-hooks":
      return pagedGetPlan(`projects/${projectId(values)}/hooks`, auth, headers, values, arraySchema());
    case "get-project-hook":
      return getPlan(`projects/${projectId(values)}/hooks/${hookId(values)}`, auth, headers, objectSchema(["id", "url"]));
    case "create-project-hook":
      return bodyPlan("POST", `projects/${projectId(values)}/hooks`, auth, headers, hookBody(values, true), objectSchema(["id", "url"]));
    case "update-project-hook":
      return bodyPlan("PUT", `projects/${projectId(values)}/hooks/${hookId(values)}`, auth, headers, hookBody(values, false), objectSchema(["id", "url"]));
    case "delete-project-hook":
      return deletePlan(`projects/${projectId(values)}/hooks/${hookId(values)}`, auth, headers);
    case "list-project-variables":
      return pagedGetPlan(`projects/${projectId(values)}/variables`, auth, headers, values, arraySchema());
    case "get-project-variable":
      return getPlan(`projects/${projectId(values)}/variables/${variableKey(values)}`, auth, headers, objectSchema(["key", "value"]));
    case "create-project-variable":
      return bodyPlan("POST", `projects/${projectId(values)}/variables`, auth, headers, variableBody(values, true), objectSchema(["key", "value"]));
    case "update-project-variable":
      return bodyPlan("PUT", `projects/${projectId(values)}/variables/${variableKey(values)}`, auth, headers, variableBody(values, false), objectSchema(["key", "value"]));
    case "delete-project-variable":
      return deletePlan(`projects/${projectId(values)}/variables/${variableKey(values)}`, auth, headers);
  }
}

function gitLabRuntimeOperation(operationId: string): GitLabRuntimeOperation | null {
  const slug = operationId.split(".").at(-1);
  if (GITLAB_OPERATIONS.has(slug as GitLabRuntimeOperation)) return slug as GitLabRuntimeOperation;
  if (slug === "list-issues") return "list-project-issues";
  if (slug === "get-issue") return "get-project-issue";
  if (slug === "add-issue-note") return "create-issue-note";
  if (slug === "list-merge-requests") return "list-project-merge-requests";
  return null;
}

const GITLAB_OPERATIONS = new Set<GitLabRuntimeOperation>([
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
  ...GITLAB_EXTRA_ACTION_SPECS.map((operation) => operation.slug),
]);

type ResponseSchema = NonNullable<ConnectorRuntimeRequestPlan["responseSchema"]>;

function getPlan(
  endpoint: string,
  auth: ConnectorRuntimeRequestPlan["auth"],
  headers: Record<string, string>,
  responseSchema: ResponseSchema,
  query?: Record<string, IntegrationJson>,
): ConnectorRuntimeRequestPlan {
  return {
    method: "GET",
    endpoint,
    auth,
    headers,
    query: query ?? {},
    body: {},
    responseSchema,
  };
}

function pagedGetPlan(
  endpoint: string,
  auth: ConnectorRuntimeRequestPlan["auth"],
  headers: Record<string, string>,
  values: Record<string, IntegrationJson>,
  responseSchema: ResponseSchema,
  extraQuery: Record<string, IntegrationJson | undefined> = {},
): ConnectorRuntimeRequestPlan {
  const pageSize = numberValue(values.perPage ?? values.per_page) ?? 20;
  return {
    ...getPlan(endpoint, auth, headers, responseSchema, removeEmptyValues({
      ...extraQuery,
      per_page: values.perPage ?? values.per_page ?? pageSize,
      page: values.page ?? 1,
    })),
    pagination: {
      mode: "offset",
      itemsPath: "",
      offsetParam: "page",
      limitParam: "per_page",
      pageSize,
      maxPages: numberValue(values.maxPages) ?? 1,
    },
  };
}

function bodyPlan(
  method: string,
  endpoint: string,
  auth: ConnectorRuntimeRequestPlan["auth"],
  headers: Record<string, string>,
  body: Record<string, IntegrationJson>,
  responseSchema: ResponseSchema,
): ConnectorRuntimeRequestPlan {
  return {
    method,
    endpoint,
    auth,
    headers,
    body,
    responseSchema,
  };
}

function deletePlan(
  endpoint: string,
  auth: ConnectorRuntimeRequestPlan["auth"],
  headers: Record<string, string>,
): ConnectorRuntimeRequestPlan {
  return bodyPlan("DELETE", endpoint, auth, headers, {}, objectSchema());
}

function genericGitLabPlan(
  spec: GitLabGenericOperationSpec,
  values: Record<string, IntegrationJson>,
  auth: ConnectorRuntimeRequestPlan["auth"],
  headers: Record<string, string>,
): ConnectorRuntimeRequestPlan {
  const endpoint = spec.endpoint.replace(/\{([^}]+)\}/g, (_, key: string) => {
    return pathSegment(requiredString(valueForGitLabKey(values, key), key));
  });
  const query = removeEmptyValues({
    ...(spec.queryDefaults ?? {}),
    ...valuesForGitLabKeys(spec.query ?? [], values),
  });
  const body = removeEmptyValues(valuesForGitLabKeys(spec.body ?? [], values));
  const responseSchema = spec.response === "array" ? arraySchema() : objectSchema(spec.requiredPaths ?? []);
  if (spec.method === "GET") {
    if (spec.paginated) return pagedGetPlan(endpoint, auth, headers, values, responseSchema, query);
    return getPlan(endpoint, auth, headers, responseSchema, query);
  }
  return bodyPlan(spec.method, endpoint, auth, headers, body, responseSchema);
}

function valuesForGitLabKeys(keys: readonly string[], values: Record<string, IntegrationJson>): Record<string, IntegrationJson | undefined> {
  return Object.fromEntries(
    keys
      .map((key) => [key, valueForGitLabKey(values, key)] as const)
      .filter(([, value]) => value != null && value !== ""),
  );
}

function valueForGitLabKey(values: Record<string, IntegrationJson>, key: string): IntegrationJson | undefined {
  return firstValue(values[key], values[camelCase(key)]);
}

function spec(
  slug: GitLabRuntimeOperation,
  method: string,
  endpoint: string,
  fields: GitLabField[],
  response: GitLabGenericOperationSpec["response"],
  options: Omit<GitLabGenericOperationSpec, "slug" | "method" | "endpoint" | "fields" | "response"> = {},
): GitLabGenericOperationSpec {
  return { slug, method, endpoint, fields, response, ...options };
}

function projectField(): GitLabField {
  return stringField("projectId", "group/project");
}

function groupField(): GitLabField {
  return stringField("groupId", "group/project");
}

function objectSchema(requiredPaths: string[] = []): ResponseSchema {
  return {
    type: "object",
    ...(requiredPaths.length > 0 ? { requiredPaths } : {}),
  };
}

function arraySchema(): ResponseSchema {
  return { type: "array" };
}

function projectBody(values: Record<string, IntegrationJson>, requireName: boolean): Record<string, IntegrationJson> {
  return removeEmptyValues({
    name: requireName ? requiredString(values.name, "name") : optionalString(values.name),
    path: optionalString(values.path),
    namespace_id: values.namespaceId ?? values.namespace_id,
    description: optionalString(values.description),
    visibility: optionalString(values.visibility),
    initialize_with_readme: values.initializeWithReadme ?? values.initialize_with_readme,
    default_branch: values.defaultBranch ?? values.default_branch,
    issues_enabled: values.issuesEnabled ?? values.issues_enabled,
    merge_requests_enabled: values.mergeRequestsEnabled ?? values.merge_requests_enabled,
    jobs_enabled: values.jobsEnabled ?? values.jobs_enabled,
    wiki_enabled: values.wikiEnabled ?? values.wiki_enabled,
    snippets_enabled: values.snippetsEnabled ?? values.snippets_enabled,
  });
}

function groupBody(values: Record<string, IntegrationJson>, requireName: boolean): Record<string, IntegrationJson> {
  return removeEmptyValues({
    name: requireName ? requiredString(values.name, "name") : optionalString(values.name),
    path: requireName ? requiredString(values.path, "path") : optionalString(values.path),
    description: optionalString(values.description),
    visibility: optionalString(values.visibility),
    parent_id: values.parentId ?? values.parent_id,
  });
}

function issueBody(values: Record<string, IntegrationJson>, requireTitle: boolean): Record<string, IntegrationJson> {
  return removeEmptyValues({
    title: requireTitle ? requiredString(values.title, "title") : optionalString(values.title),
    description: values.description ?? values.body,
    labels: values.labels,
    add_labels: values.addLabels ?? values.add_labels,
    remove_labels: values.removeLabels ?? values.remove_labels,
    assignee_ids: values.assigneeIds ?? values.assignee_ids,
    confidential: values.confidential,
    due_date: values.dueDate ?? values.due_date,
    issue_type: values.issueType ?? values.issue_type,
    milestone_id: values.milestoneId ?? values.milestone_id,
    state_event: values.stateEvent ?? values.state_event,
    weight: values.weight,
  });
}

function mergeRequestBody(values: Record<string, IntegrationJson>, requireCore: boolean): Record<string, IntegrationJson> {
  return removeEmptyValues({
    source_branch: requireCore ? requiredString(values.sourceBranch ?? values.source_branch, "sourceBranch") : optionalString(firstValue(values.sourceBranch, values.source_branch)),
    target_branch: requireCore ? requiredString(values.targetBranch ?? values.target_branch, "targetBranch") : optionalString(firstValue(values.targetBranch, values.target_branch)),
    title: requireCore ? requiredString(values.title, "title") : optionalString(values.title),
    description: values.description ?? values.body,
    labels: values.labels,
    assignee_ids: values.assigneeIds ?? values.assignee_ids,
    reviewer_ids: values.reviewerIds ?? values.reviewer_ids,
    milestone_id: values.milestoneId ?? values.milestone_id,
    remove_source_branch: values.removeSourceBranch ?? values.remove_source_branch,
    squash: values.squash,
    state_event: values.stateEvent ?? values.state_event,
  });
}

function noteBody(values: Record<string, IntegrationJson>, requireBody: boolean): Record<string, IntegrationJson> {
  return removeEmptyValues({
    body: requireBody ? requiredString(values.body, "body") : optionalString(values.body),
    internal: values.internal,
  });
}

function repositoryFileBody(values: Record<string, IntegrationJson>, requireCore: boolean): Record<string, IntegrationJson> {
  return removeEmptyValues({
    branch: requireCore ? requiredString(values.branch, "branch") : optionalString(values.branch),
    content: requireCore ? requiredString(values.content, "content") : optionalString(values.content),
    commit_message: requireCore ? requiredString(values.commitMessage ?? values.commit_message, "commitMessage") : optionalString(firstValue(values.commitMessage, values.commit_message)),
    encoding: optionalString(values.encoding),
    author_email: values.authorEmail ?? values.author_email,
    author_name: values.authorName ?? values.author_name,
  });
}

function releaseBody(values: Record<string, IntegrationJson>, requireCore: boolean): Record<string, IntegrationJson> {
  return removeEmptyValues({
    tag_name: requireCore ? requiredString(values.tagName ?? values.tag_name, "tagName") : optionalString(firstValue(values.tagName, values.tag_name)),
    name: requireCore ? requiredString(values.name, "name") : optionalString(values.name),
    description: values.description ?? values.body,
    ref: optionalString(values.ref),
    milestones: optionalJsonArray(values.milestones),
    assets: optionalJsonObject(values.assets),
  });
}

function labelBody(values: Record<string, IntegrationJson>, requireName: boolean): Record<string, IntegrationJson> {
  return removeEmptyValues({
    name: requireName ? requiredString(values.name, "name") : optionalString(firstValue(values.newName, values.new_name, values.name)),
    new_name: values.newName ?? values.new_name,
    color: requireName ? requiredString(values.color, "color") : optionalString(values.color),
    description: optionalString(values.description),
    priority: values.priority,
  });
}

function milestoneBody(values: Record<string, IntegrationJson>, requireTitle: boolean): Record<string, IntegrationJson> {
  return removeEmptyValues({
    title: requireTitle ? requiredString(values.title, "title") : optionalString(values.title),
    description: values.description ?? values.body,
    due_date: values.dueDate ?? values.due_date,
    start_date: values.startDate ?? values.start_date,
    state_event: values.stateEvent ?? values.state_event,
  });
}

function memberBody(values: Record<string, IntegrationJson>, requireUser: boolean): Record<string, IntegrationJson> {
  return removeEmptyValues({
    user_id: requireUser ? numberId(values.userId ?? values.user_id, "userId") : undefined,
    access_level: requiredNumber(values.accessLevel ?? values.access_level, "accessLevel"),
    expires_at: values.expiresAt ?? values.expires_at,
  });
}

function hookBody(values: Record<string, IntegrationJson>, requireUrl: boolean): Record<string, IntegrationJson> {
  return removeEmptyValues({
    url: requireUrl ? requiredString(values.url, "url") : optionalString(values.url),
    token: optionalString(values.token),
    push_events: values.pushEvents ?? values.push_events,
    issues_events: values.issuesEvents ?? values.issues_events,
    merge_requests_events: values.mergeRequestsEvents ?? values.merge_requests_events,
    tag_push_events: values.tagPushEvents ?? values.tag_push_events,
    note_events: values.noteEvents ?? values.note_events,
    job_events: values.jobEvents ?? values.job_events,
    pipeline_events: values.pipelineEvents ?? values.pipeline_events,
    wiki_page_events: values.wikiPageEvents ?? values.wiki_page_events,
    releases_events: values.releasesEvents ?? values.releases_events,
    enable_ssl_verification: values.enableSslVerification ?? values.enable_ssl_verification,
  });
}

function variableBody(values: Record<string, IntegrationJson>, requireCore: boolean): Record<string, IntegrationJson> {
  return removeEmptyValues({
    key: requireCore ? requiredString(values.key, "key") : optionalString(values.key),
    value: requireCore ? requiredString(values.value, "value") : optionalString(values.value),
    variable_type: values.variableType ?? values.variable_type,
    protected: values.protected,
    masked: values.masked,
    raw: values.raw,
    environment_scope: values.environmentScope ?? values.environment_scope,
  });
}

function stringField(name: string, defaultValue = "sample", optional = false): GitLabField {
  return { name, type: "string", optional, default: defaultValue };
}

function optionalStringField(name: string, defaultValue: string): GitLabField {
  return stringField(name, defaultValue, true);
}

function integerField(name: string, defaultValue = 1, optional = false, max?: number): GitLabField {
  return { name, type: "integer", optional, min: 1, default: defaultValue, ...(max ? { max } : {}) };
}

function booleanField(name: string, defaultValue: boolean, optional = false): GitLabField {
  return { name, type: "boolean", optional, default: defaultValue };
}

function projectId(values: Record<string, IntegrationJson>): string {
  return pathSegment(requiredString(firstValue(values.projectId, values.project, values.id), "projectId"));
}

function groupId(values: Record<string, IntegrationJson>): string {
  return pathSegment(requiredString(firstValue(values.groupId, values.group, values.id), "groupId"));
}

function issueIid(values: Record<string, IntegrationJson>): string {
  return numberId(firstValue(values.issueIid, values.issue_iid), "issueIid");
}

function mergeRequestIid(values: Record<string, IntegrationJson>): string {
  return numberId(firstValue(values.mergeRequestIid, values.merge_request_iid, values.mergeRequestId), "mergeRequestIid");
}

function noteId(values: Record<string, IntegrationJson>): string {
  return numberId(firstValue(values.noteId, values.note_id), "noteId");
}

function branchName(values: Record<string, IntegrationJson>): string {
  return pathSegment(requiredString(values.branch ?? values.name, "branch"));
}

function tagName(values: Record<string, IntegrationJson>): string {
  return pathSegment(requiredString(firstValue(values.tagName, values.tag_name, values.name), "tagName"));
}

function filePath(values: Record<string, IntegrationJson>): string {
  return pathSegment(requiredString(firstValue(values.filePath, values.file_path, values.path), "filePath"));
}

function commitSha(values: Record<string, IntegrationJson>): string {
  return pathSegment(requiredString(firstValue(values.sha, values.commitSha, values.commit_sha), "commitSha"));
}

function pipelineId(values: Record<string, IntegrationJson>): string {
  return numberId(firstValue(values.pipelineId, values.pipeline_id), "pipelineId");
}

function jobId(values: Record<string, IntegrationJson>): string {
  return numberId(firstValue(values.jobId, values.job_id), "jobId");
}

function milestoneId(values: Record<string, IntegrationJson>): string {
  return numberId(firstValue(values.milestoneId, values.milestone_id), "milestoneId");
}

function userId(values: Record<string, IntegrationJson>): string {
  return numberId(firstValue(values.userId, values.user_id), "userId");
}

function hookId(values: Record<string, IntegrationJson>): string {
  return numberId(firstValue(values.hookId, values.hook_id), "hookId");
}

function variableKey(values: Record<string, IntegrationJson>): string {
  return pathSegment(requiredString(values.key, "key"));
}

function firstValue(...values: IntegrationJson[]): IntegrationJson {
  return values.find((value) => value != null && value !== "") ?? null;
}

function requiredString(value: IntegrationJson, name: string): string {
  const parsed = optionalString(value);
  if (!parsed) throw new Error(`GitLab ${name} is required`);
  return parsed;
}

function optionalString(value: IntegrationJson): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function numberId(value: IntegrationJson, name: string): string {
  const parsed = requiredNumber(value, name);
  return String(parsed);
}

function requiredNumber(value: IntegrationJson, name: string): number {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string" && /^[1-9]\d*$/.test(value.trim())) return Number(value.trim());
  throw new Error(`GitLab ${name} must be a positive integer`);
}

function pathSegment(value: string): string {
  return encodeURIComponent(value);
}

function camelCase(value: string): string {
  return value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function numberValue(value: IntegrationJson): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function optionalJsonArray(value: IntegrationJson): IntegrationJson[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function requiredJsonArray(value: IntegrationJson, name: string): IntegrationJson[] {
  const parsed = optionalJsonArray(value);
  if (!parsed) throw new Error(`GitLab ${name} is required`);
  return parsed;
}

function optionalJsonObject(value: IntegrationJson): Record<string, IntegrationJson> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, IntegrationJson>
    : undefined;
}

function removeEmptyValues(input: Record<string, IntegrationJson | undefined>): Record<string, IntegrationJson> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined && value !== "" && value !== null),
  ) as Record<string, IntegrationJson>;
}
