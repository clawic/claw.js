import type {
  ConnectorRuntimeRequestPlan,
} from "./runtime-registry.ts";
import type {
  ConnectorFieldDefinition,
  ConnectorOperationDefinition,
  IntegrationJson,
} from "./types.ts";

export type GitHubField = ConnectorFieldDefinition;

interface GitHubGenericOperationSpec {
  slug: string;
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  endpoint: string | ((values: Record<string, IntegrationJson>) => string);
  fields: GitHubField[];
  query?: string[];
  body?: string[];
  requiredPaths?: string[];
  responseType?: NonNullable<ConnectorRuntimeRequestPlan["responseSchema"]>["type"];
  paged?: boolean;
}

export const GITHUB_CORE_ACTION_SLUGS = [
  "get-authenticated-user",
  "get-user",
  "list-user-repositories",
  "list-org-repositories",
  "create-user-repository",
  "create-org-repository",
  "get-repository",
  "update-repository",
  "delete-repository",
  "list-branches",
  "get-branch",
  "get-repository-content",
  "create-or-update-file",
  "delete-file",
  "get-issue",
  "list-repository-issues",
  "create-issue",
  "update-issue",
  "lock-issue",
  "unlock-issue",
  "list-issue-comments",
  "create-issue-comment",
  "update-issue-comment",
  "delete-issue-comment",
  "list-labels",
  "create-label",
  "update-label",
  "delete-label",
  "list-milestones",
  "create-milestone",
  "update-milestone",
  "delete-milestone",
  "list-pull-requests",
  "get-pull-request",
  "create-pull-request",
  "update-pull-request",
  "merge-pull-request",
  "list-pull-request-files",
  "list-pull-request-commits",
  "list-releases",
  "get-release",
  "create-release",
  "update-release",
  "delete-release",
  "list-workflows",
  "get-workflow",
  "dispatch-workflow",
  "list-workflow-runs",
  "get-workflow-run",
  "rerun-workflow-run",
  "cancel-workflow-run",
  "list-repository-webhooks",
  "get-repository-webhook",
  "create-repository-webhook",
  "delete-repository-webhook",
  "ping-repository-webhook",
  "list-gists",
  "get-gist",
  "create-gist",
  "update-gist",
  "delete-gist",
] as const;

const OWNER_FIELD = stringField("owner", { default: "octocat" });
const REPO_FIELD = stringField("repo", { default: "Hello-World" });
const REPO_FIELDS = [OWNER_FIELD, REPO_FIELD] as const;
const SHA_FIELD = stringField("sha", { default: "abc123" });
const BRANCH_FIELD = stringField("branch", { optional: true, default: "main" });
const PER_PAGE_FIELD = integerField("perPage", { optional: true, default: 1, min: 1, max: 100 });
const PAGE_FIELD = integerField("page", { optional: true, default: 1, min: 1 });
const PAGING_FIELDS = [PER_PAGE_FIELD, PAGE_FIELD] as const;
const PULL_NUMBER_FIELD = integerField("pullNumber", { default: 1, min: 1 });
const DEPLOYMENT_ID_FIELD = integerField("deploymentId", { default: 1, min: 1 });
const REVIEW_ID_FIELD = integerField("reviewId", { default: 1, min: 1 });
const COMMENT_ID_FIELD = integerField("commentId", { default: 1, min: 1 });

export const GITHUB_EXTRA_ACTION_SPECS = [
  spec("list-commits", "GET", (values) => `${repoPath(values)}/commits`, [...REPO_FIELDS, SHA_FIELD, stringField("path", { optional: true, default: "README.md" }), stringField("author", { optional: true, default: "octocat" }), stringField("since", { optional: true, default: "2026-01-01T00:00:00Z" }), stringField("until", { optional: true, default: "2026-01-02T00:00:00Z" }), ...PAGING_FIELDS], { query: ["sha", "path", "author", "since", "until", "per_page", "page"], responseType: "array", paged: true }),
  spec("get-commit", "GET", (values) => `${repoPath(values)}/commits/${pathSegment(requiredString(firstValue(values.ref, values.sha), "ref"))}`, [...REPO_FIELDS, stringField("ref", { default: "abc123" })], { requiredPaths: ["sha", "commit"] }),
  spec("compare-commits", "GET", (values) => `${repoPath(values)}/compare/${pathSegment(requiredString(values.base, "base"))}...${pathSegment(requiredString(values.head, "head"))}`, [...REPO_FIELDS, stringField("base", { default: "main" }), stringField("head", { default: "feature" })], { requiredPaths: ["status", "ahead_by", "behind_by", "commits"] }),
  spec("list-commit-comments", "GET", (values) => `${repoPath(values)}/commits/${pathSegment(requiredString(values.ref, "ref"))}/comments`, [...REPO_FIELDS, stringField("ref", { default: "abc123" }), ...PAGING_FIELDS], { query: ["per_page", "page"], responseType: "array", paged: true }),
  spec("create-commit-comment", "POST", (values) => `${repoPath(values)}/commits/${pathSegment(requiredString(values.ref, "ref"))}/comments`, [...REPO_FIELDS, stringField("ref", { default: "abc123" }), stringField("body", { default: "Looks good" }), stringField("path", { optional: true, default: "README.md" }), integerField("position", { optional: true, default: 1, min: 1 })], { body: ["body", "path", "position"], requiredPaths: ["id", "body"] }),
  spec("create-commit-status", "POST", (values) => `${repoPath(values)}/statuses/${pathSegment(requiredString(values.sha, "sha"))}`, [...REPO_FIELDS, SHA_FIELD, stringField("state", { default: "success" }), stringField("targetUrl", { optional: true, default: "https://example.invalid/build" }), stringField("description", { optional: true, default: "Build passed" }), stringField("context", { optional: true, default: "ci/clawjs" })], { body: ["state", "target_url", "description", "context"], requiredPaths: ["id", "state", "context"] }),
  spec("list-commit-statuses", "GET", (values) => `${repoPath(values)}/commits/${pathSegment(requiredString(values.ref, "ref"))}/statuses`, [...REPO_FIELDS, stringField("ref", { default: "abc123" }), ...PAGING_FIELDS], { query: ["per_page", "page"], responseType: "array", paged: true }),
  spec("get-combined-status", "GET", (values) => `${repoPath(values)}/commits/${pathSegment(requiredString(values.ref, "ref"))}/status`, [...REPO_FIELDS, stringField("ref", { default: "abc123" })], { requiredPaths: ["state", "statuses"] }),
  spec("list-repository-tags", "GET", (values) => `${repoPath(values)}/tags`, [...REPO_FIELDS, ...PAGING_FIELDS], { query: ["per_page", "page"], responseType: "array", paged: true }),
  spec("list-repository-contributors", "GET", (values) => `${repoPath(values)}/contributors`, [...REPO_FIELDS, booleanField("anonymous", { optional: true, default: false }), ...PAGING_FIELDS], { query: ["anonymous", "per_page", "page"], responseType: "array", paged: true }),
  spec("list-repository-languages", "GET", (values) => `${repoPath(values)}/languages`, REPO_FIELDS, { requiredPaths: [] }),
  spec("list-repository-topics", "GET", (values) => `${repoPath(values)}/topics`, REPO_FIELDS, { requiredPaths: ["names"] }),
  spec("replace-repository-topics", "PUT", (values) => `${repoPath(values)}/topics`, [...REPO_FIELDS, arrayField("names", ["clawjs", "integrations"])], { body: ["names"], requiredPaths: ["names"] }),
  spec("list-repository-collaborators", "GET", (values) => `${repoPath(values)}/collaborators`, [...REPO_FIELDS, stringField("affiliation", { optional: true, default: "all" }), stringField("permission", { optional: true, default: "pull" }), ...PAGING_FIELDS], { query: ["affiliation", "permission", "per_page", "page"], responseType: "array", paged: true }),
  spec("add-repository-collaborator", "PUT", (values) => `${repoPath(values)}/collaborators/${pathSegment(requiredString(values.username, "username"))}`, [...REPO_FIELDS, stringField("username", { default: "hubot" }), stringField("permission", { optional: true, default: "push" })], { body: ["permission"], requiredPaths: ["id"] }),
  spec("remove-repository-collaborator", "DELETE", (values) => `${repoPath(values)}/collaborators/${pathSegment(requiredString(values.username, "username"))}`, [...REPO_FIELDS, stringField("username", { default: "hubot" })]),
  spec("list-repository-teams", "GET", (values) => `${repoPath(values)}/teams`, [...REPO_FIELDS, ...PAGING_FIELDS], { query: ["per_page", "page"], responseType: "array", paged: true }),
  spec("list-forks", "GET", (values) => `${repoPath(values)}/forks`, [...REPO_FIELDS, stringField("sort", { optional: true, default: "newest" }), ...PAGING_FIELDS], { query: ["sort", "per_page", "page"], responseType: "array", paged: true }),
  spec("create-fork", "POST", (values) => `${repoPath(values)}/forks`, [...REPO_FIELDS, stringField("organization", { optional: true, default: "octo-org" }), stringField("name", { optional: true, default: "Hello-World-fork" }), booleanField("defaultBranchOnly", { optional: true, default: true })], { body: ["organization", "name", "default_branch_only"], requiredPaths: ["id", "name", "full_name"] }),
  spec("list-pull-request-reviews", "GET", (values) => `${repoPath(values)}/pulls/${pullNumber(values)}/reviews`, [...REPO_FIELDS, PULL_NUMBER_FIELD, ...PAGING_FIELDS], { query: ["per_page", "page"], responseType: "array", paged: true }),
  spec("get-pull-request-review", "GET", (values) => `${repoPath(values)}/pulls/${pullNumber(values)}/reviews/${pathSegment(requiredNumberString(firstValue(values.reviewId, values.review_id), "reviewId"))}`, [...REPO_FIELDS, PULL_NUMBER_FIELD, REVIEW_ID_FIELD], { requiredPaths: ["id", "state"] }),
  spec("create-pull-request-review", "POST", (values) => `${repoPath(values)}/pulls/${pullNumber(values)}/reviews`, [...REPO_FIELDS, PULL_NUMBER_FIELD, stringField("body", { optional: true, default: "Reviewed offline" }), stringField("event", { optional: true, default: "COMMENT" }), arrayField("comments", [{ path: "README.md", position: 1, body: "Looks good" }])], { body: ["body", "event", "comments"], requiredPaths: ["id", "state"] }),
  spec("submit-pull-request-review", "POST", (values) => `${repoPath(values)}/pulls/${pullNumber(values)}/reviews/${pathSegment(requiredNumberString(firstValue(values.reviewId, values.review_id), "reviewId"))}/events`, [...REPO_FIELDS, PULL_NUMBER_FIELD, REVIEW_ID_FIELD, stringField("event", { default: "APPROVE" }), stringField("body", { optional: true, default: "Approved" })], { body: ["event", "body"], requiredPaths: ["id", "state"] }),
  spec("dismiss-pull-request-review", "PUT", (values) => `${repoPath(values)}/pulls/${pullNumber(values)}/reviews/${pathSegment(requiredNumberString(firstValue(values.reviewId, values.review_id), "reviewId"))}/dismissals`, [...REPO_FIELDS, PULL_NUMBER_FIELD, REVIEW_ID_FIELD, stringField("message", { default: "Stale review" })], { body: ["message"], requiredPaths: ["id", "state"] }),
  spec("list-review-comments", "GET", (values) => `${repoPath(values)}/pulls/comments`, [...REPO_FIELDS, stringField("sort", { optional: true, default: "created" }), stringField("direction", { optional: true, default: "asc" }), stringField("since", { optional: true, default: "2026-01-01T00:00:00Z" }), ...PAGING_FIELDS], { query: ["sort", "direction", "since", "per_page", "page"], responseType: "array", paged: true }),
  spec("create-review-comment", "POST", (values) => `${repoPath(values)}/pulls/${pullNumber(values)}/comments`, [...REPO_FIELDS, PULL_NUMBER_FIELD, stringField("body", { default: "Review comment" }), stringField("commitId", { default: "abc123" }), stringField("path", { default: "README.md" }), integerField("line", { default: 1, min: 1 }), stringField("side", { optional: true, default: "RIGHT" })], { body: ["body", "commit_id", "path", "line", "side"], requiredPaths: ["id", "body"] }),
  spec("update-review-comment", "PATCH", (values) => `${repoPath(values)}/pulls/comments/${pathSegment(requiredNumberString(firstValue(values.commentId, values.comment_id), "commentId"))}`, [...REPO_FIELDS, COMMENT_ID_FIELD, stringField("body", { default: "Updated review comment" })], { body: ["body"], requiredPaths: ["id", "body"] }),
  spec("delete-review-comment", "DELETE", (values) => `${repoPath(values)}/pulls/comments/${pathSegment(requiredNumberString(firstValue(values.commentId, values.comment_id), "commentId"))}`, [...REPO_FIELDS, COMMENT_ID_FIELD]),
  spec("request-reviewers", "POST", (values) => `${repoPath(values)}/pulls/${pullNumber(values)}/requested_reviewers`, [...REPO_FIELDS, PULL_NUMBER_FIELD, arrayField("reviewers", ["hubot"]), arrayField("teamReviewers", ["octo-team"], true)], { body: ["reviewers", "team_reviewers"], requiredPaths: ["id", "number", "requested_reviewers"] }),
  spec("remove-requested-reviewers", "DELETE", (values) => `${repoPath(values)}/pulls/${pullNumber(values)}/requested_reviewers`, [...REPO_FIELDS, PULL_NUMBER_FIELD, arrayField("reviewers", ["hubot"]), arrayField("teamReviewers", ["octo-team"], true)], { body: ["reviewers", "team_reviewers"], requiredPaths: ["id", "number"] }),
  spec("list-deployments", "GET", (values) => `${repoPath(values)}/deployments`, [...REPO_FIELDS, SHA_FIELD, stringField("ref", { optional: true, default: "main" }), stringField("task", { optional: true, default: "deploy" }), stringField("environment", { optional: true, default: "production" }), ...PAGING_FIELDS], { query: ["sha", "ref", "task", "environment", "per_page", "page"], responseType: "array", paged: true }),
  spec("create-deployment", "POST", (values) => `${repoPath(values)}/deployments`, [...REPO_FIELDS, stringField("ref", { default: "main" }), stringField("task", { optional: true, default: "deploy" }), booleanField("autoMerge", { optional: true, default: false }), arrayField("requiredContexts", [], true), objectField("payload", { environment: "production" }, true), stringField("environment", { optional: true, default: "production" }), stringField("description", { optional: true, default: "Deploy request" })], { body: ["ref", "task", "auto_merge", "required_contexts", "payload", "environment", "description"], requiredPaths: ["id", "sha", "ref"] }),
  spec("get-deployment", "GET", (values) => `${repoPath(values)}/deployments/${pathSegment(requiredNumberString(firstValue(values.deploymentId, values.deployment_id), "deploymentId"))}`, [...REPO_FIELDS, DEPLOYMENT_ID_FIELD], { requiredPaths: ["id", "sha", "ref"] }),
  spec("delete-deployment", "DELETE", (values) => `${repoPath(values)}/deployments/${pathSegment(requiredNumberString(firstValue(values.deploymentId, values.deployment_id), "deploymentId"))}`, [...REPO_FIELDS, DEPLOYMENT_ID_FIELD]),
  spec("list-deployment-statuses", "GET", (values) => `${repoPath(values)}/deployments/${pathSegment(requiredNumberString(firstValue(values.deploymentId, values.deployment_id), "deploymentId"))}/statuses`, [...REPO_FIELDS, DEPLOYMENT_ID_FIELD, ...PAGING_FIELDS], { query: ["per_page", "page"], responseType: "array", paged: true }),
  spec("create-deployment-status", "POST", (values) => `${repoPath(values)}/deployments/${pathSegment(requiredNumberString(firstValue(values.deploymentId, values.deployment_id), "deploymentId"))}/statuses`, [...REPO_FIELDS, DEPLOYMENT_ID_FIELD, stringField("state", { default: "success" }), stringField("targetUrl", { optional: true, default: "https://example.invalid/deploy" }), stringField("logUrl", { optional: true, default: "https://example.invalid/deploy/log" }), stringField("description", { optional: true, default: "Deployment finished" }), stringField("environment", { optional: true, default: "production" }), booleanField("autoInactive", { optional: true, default: true })], { body: ["state", "target_url", "log_url", "description", "environment", "auto_inactive"], requiredPaths: ["id", "state"] }),
  spec("list-run-jobs", "GET", (values) => `${repoPath(values)}/actions/runs/${pathSegment(requiredNumberString(firstValue(values.runId, values.run_id), "runId"))}/jobs`, [...REPO_FIELDS, integerField("runId", { default: 1, min: 1 }), stringField("filter", { optional: true, default: "latest" }), ...PAGING_FIELDS], { query: ["filter", "per_page", "page"], requiredPaths: ["total_count", "jobs"] }),
  spec("list-run-artifacts", "GET", (values) => `${repoPath(values)}/actions/runs/${pathSegment(requiredNumberString(firstValue(values.runId, values.run_id), "runId"))}/artifacts`, [...REPO_FIELDS, integerField("runId", { default: 1, min: 1 }), ...PAGING_FIELDS], { query: ["per_page", "page"], requiredPaths: ["total_count", "artifacts"] }),
  spec("get-artifact", "GET", (values) => `${repoPath(values)}/actions/artifacts/${pathSegment(requiredNumberString(firstValue(values.artifactId, values.artifact_id), "artifactId"))}`, [...REPO_FIELDS, integerField("artifactId", { default: 1, min: 1 })], { requiredPaths: ["id", "name"] }),
  spec("delete-artifact", "DELETE", (values) => `${repoPath(values)}/actions/artifacts/${pathSegment(requiredNumberString(firstValue(values.artifactId, values.artifact_id), "artifactId"))}`, [...REPO_FIELDS, integerField("artifactId", { default: 1, min: 1 })]),
  spec("get-repository-public-key", "GET", (values) => `${repoPath(values)}/actions/secrets/public-key`, REPO_FIELDS, { requiredPaths: ["key_id", "key"] }),
  spec("list-repository-secrets", "GET", (values) => `${repoPath(values)}/actions/secrets`, [...REPO_FIELDS, ...PAGING_FIELDS], { query: ["per_page", "page"], requiredPaths: ["total_count", "secrets"] }),
  spec("get-organization", "GET", (values) => `orgs/${pathSegment(requiredString(firstValue(values.org, values.organization), "org"))}`, [stringField("org", { default: "octo-org" })], { requiredPaths: ["id", "login"] }),
  spec("list-organization-members", "GET", (values) => `orgs/${pathSegment(requiredString(firstValue(values.org, values.organization), "org"))}/members`, [stringField("org", { default: "octo-org" }), stringField("filter", { optional: true, default: "all" }), stringField("role", { optional: true, default: "all" }), ...PAGING_FIELDS], { query: ["filter", "role", "per_page", "page"], responseType: "array", paged: true }),
  spec("list-user-organizations", "GET", (values) => `users/${pathSegment(requiredString(values.username, "username"))}/orgs`, [stringField("username", { default: "octocat" }), ...PAGING_FIELDS], { query: ["per_page", "page"], responseType: "array", paged: true }),
  spec("search-repositories", "GET", "search/repositories", [stringField("q", { default: "topic:integrations" }), stringField("sort", { optional: true, default: "stars" }), stringField("order", { optional: true, default: "desc" }), ...PAGING_FIELDS], { query: ["q", "sort", "order", "per_page", "page"], requiredPaths: ["total_count", "items"] }),
  spec("search-issues", "GET", "search/issues", [stringField("q", { default: "repo:octocat/Hello-World is:issue" }), stringField("sort", { optional: true, default: "created" }), stringField("order", { optional: true, default: "desc" }), ...PAGING_FIELDS], { query: ["q", "sort", "order", "per_page", "page"], requiredPaths: ["total_count", "items"] }),
  spec("search-code", "GET", "search/code", [stringField("q", { default: "addClass in:file language:js repo:octocat/Hello-World" }), stringField("sort", { optional: true, default: "indexed" }), stringField("order", { optional: true, default: "desc" }), ...PAGING_FIELDS], { query: ["q", "sort", "order", "per_page", "page"], requiredPaths: ["total_count", "items"] }),
  spec("search-users", "GET", "search/users", [stringField("q", { default: "octocat in:login" }), stringField("sort", { optional: true, default: "repositories" }), stringField("order", { optional: true, default: "desc" }), ...PAGING_FIELDS], { query: ["q", "sort", "order", "per_page", "page"], requiredPaths: ["total_count", "items"] }),
  spec("search-commits", "GET", "search/commits", [stringField("q", { default: "repo:octocat/Hello-World fix" }), stringField("sort", { optional: true, default: "author-date" }), stringField("order", { optional: true, default: "desc" }), ...PAGING_FIELDS], { query: ["q", "sort", "order", "per_page", "page"], requiredPaths: ["total_count", "items"] }),
  spec("list-matching-refs", "GET", (values) => `${repoPath(values)}/git/matching-refs/${pathSegment(requiredString(values.ref, "ref"))}`, [...REPO_FIELDS, stringField("ref", { default: "heads" })], { responseType: "array" }),
  spec("get-reference", "GET", (values) => `${repoPath(values)}/git/ref/${pathSegment(requiredString(values.ref, "ref"))}`, [...REPO_FIELDS, stringField("ref", { default: "heads/main" })], { requiredPaths: ["ref", "object"] }),
  spec("create-reference", "POST", (values) => `${repoPath(values)}/git/refs`, [...REPO_FIELDS, stringField("ref", { default: "refs/heads/feature" }), SHA_FIELD], { body: ["ref", "sha"], requiredPaths: ["ref", "object"] }),
  spec("update-reference", "PATCH", (values) => `${repoPath(values)}/git/refs/${pathSegment(requiredString(values.ref, "ref"))}`, [...REPO_FIELDS, stringField("ref", { default: "heads/feature" }), SHA_FIELD, booleanField("force", { optional: true, default: false })], { body: ["sha", "force"], requiredPaths: ["ref", "object"] }),
  spec("delete-reference", "DELETE", (values) => `${repoPath(values)}/git/refs/${pathSegment(requiredString(values.ref, "ref"))}`, [...REPO_FIELDS, stringField("ref", { default: "heads/feature" })]),
] as const satisfies readonly GitHubGenericOperationSpec[];

export const GITHUB_ACTION_SLUGS = [
  ...GITHUB_CORE_ACTION_SLUGS,
  ...GITHUB_EXTRA_ACTION_SPECS.map((item) => item.slug),
] as const;

export type GitHubRuntimeOperation = typeof GITHUB_ACTION_SLUGS[number];

const GITHUB_OPERATION_SET = new Set<string>(GITHUB_ACTION_SLUGS);
const GITHUB_EXTRA_SPEC_BY_SLUG = new Map(GITHUB_EXTRA_ACTION_SPECS.map((item) => [item.slug, item]));
const GITHUB_OPERATION_ALIASES: Record<string, GitHubRuntimeOperation> = {
  "get-current-user": "get-authenticated-user",
  "find-issue": "get-issue",
  "list-issues": "list-repository-issues",
  "open-issue": "create-issue",
  "add-comment": "create-issue-comment",
};

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
  const genericSpec = GITHUB_EXTRA_SPEC_BY_SLUG.get(runtimeOperation);
  if (genericSpec) return genericGitHubPlan(genericSpec, values, auth, headers);

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
  throw new Error(`Unsupported GitHub operation: ${operation.id}`);
}

function gitHubRuntimeOperation(operationId: string): GitHubRuntimeOperation | null {
  const slug = operationId.split(".").at(-1);
  const resolved = slug ? GITHUB_OPERATION_ALIASES[slug] ?? slug : null;
  if (resolved && GITHUB_OPERATION_SET.has(resolved)) return resolved as GitHubRuntimeOperation;
  return null;
}

function spec(
  slug: string,
  method: GitHubGenericOperationSpec["method"],
  endpoint: GitHubGenericOperationSpec["endpoint"],
  fields: readonly GitHubField[],
  options: Omit<GitHubGenericOperationSpec, "slug" | "method" | "endpoint" | "fields"> = {},
): GitHubGenericOperationSpec {
  return { slug, method, endpoint, fields: [...fields], ...options };
}

function genericGitHubPlan(
  spec: GitHubGenericOperationSpec,
  values: Record<string, IntegrationJson>,
  auth: ConnectorRuntimeRequestPlan["auth"],
  headers: Record<string, string>,
): ConnectorRuntimeRequestPlan {
  const endpoint = typeof spec.endpoint === "function" ? spec.endpoint(values) : spec.endpoint;
  const responseType = spec.responseType ?? "object";
  const requiredPaths = spec.requiredPaths ?? [];
  if (spec.method === "GET") {
    const query = valuesForGitHubKeys(spec.query ?? [], values);
    if (spec.paged) return getPagedPlan(endpoint, auth, headers, query, responseType);
    return getPlan(endpoint, auth, headers, query, requiredPaths, responseType);
  }
  const body = valuesForGitHubKeys(spec.body ?? [], values);
  if (spec.method === "POST") return postPlan(endpoint, auth, headers, body, requiredPaths);
  if (spec.method === "PATCH") return patchPlan(endpoint, auth, headers, body, requiredPaths);
  if (spec.method === "PUT") return putPlan(endpoint, auth, headers, body, requiredPaths);
  return deletePlan(endpoint, auth, headers, body, requiredPaths);
}

function valuesForGitHubKeys(keys: readonly string[], values: Record<string, IntegrationJson>): Record<string, IntegrationJson | undefined> {
  return Object.fromEntries(keys.map((key) => [key, valueForGitHubKey(key, values)]));
}

function valueForGitHubKey(key: string, values: Record<string, IntegrationJson>): IntegrationJson | undefined {
  return firstValue(values[key], values[camelCase(key)]);
}

function getPlan(
  endpoint: string,
  auth: ConnectorRuntimeRequestPlan["auth"],
  headers: Record<string, string>,
  query: Record<string, IntegrationJson | undefined>,
  requiredPaths: string[],
  type: NonNullable<ConnectorRuntimeRequestPlan["responseSchema"]>["type"] = "object",
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
  type: NonNullable<ConnectorRuntimeRequestPlan["responseSchema"]>["type"],
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

function stringField(name: string, options: { optional?: boolean; default?: string } = {}): GitHubField {
  return {
    name,
    type: "string",
    optional: options.optional ?? false,
    ...(options.default !== undefined ? { default: options.default } : {}),
  };
}

function integerField(name: string, options: { optional?: boolean; default?: number; min?: number; max?: number } = {}): GitHubField {
  return {
    name,
    type: "integer",
    optional: options.optional ?? false,
    ...(options.default !== undefined ? { default: options.default } : {}),
    ...(options.min !== undefined ? { min: options.min } : {}),
    ...(options.max !== undefined ? { max: options.max } : {}),
  };
}

function booleanField(name: string, options: { optional?: boolean; default?: boolean } = {}): GitHubField {
  return {
    name,
    type: "boolean",
    optional: options.optional ?? false,
    ...(options.default !== undefined ? { default: options.default } : {}),
  };
}

function arrayField(name: string, defaultValue: IntegrationJson[], optional = false): GitHubField {
  return {
    name,
    type: "array",
    optional,
    default: defaultValue,
  };
}

function objectField(name: string, defaultValue: Record<string, IntegrationJson>, optional = false): GitHubField {
  return {
    name,
    type: "object",
    optional,
    default: defaultValue,
  };
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

function camelCase(key: string): string {
  return key.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase());
}

function removeEmptyValues(input: Record<string, IntegrationJson | undefined>): Record<string, IntegrationJson> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value != null && value !== ""),
  ) as Record<string, IntegrationJson>;
}
