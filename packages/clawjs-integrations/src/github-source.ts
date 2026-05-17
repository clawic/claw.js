import type {
  ConnectorRuntimeSourcePlan,
} from "./runtime-registry.ts";
import type {
  ConnectorOperationDefinition,
} from "./types.ts";

export const GITHUB_SOURCE_SLUGS = [
  "webhook-event",
  "push",
  "issues",
  "issue-comment",
  "pull-request",
  "pull-request-review",
  "pull-request-review-comment",
  "workflow-run",
  "workflow-job",
  "release",
  "deployment",
  "deployment-status",
  "check-run",
  "check-suite",
  "create",
  "delete",
  "fork",
  "star",
  "watch",
  "repository",
  "member",
] as const;

type GitHubSourceOperation = typeof GITHUB_SOURCE_SLUGS[number];

const GITHUB_SOURCE_SET = new Set<string>(GITHUB_SOURCE_SLUGS);
const GITHUB_SOURCE_ALIASES: Record<string, GitHubSourceOperation> = {
  event: "webhook-event",
  issues: "issues",
  issue_comment: "issue-comment",
  pull_request: "pull-request",
  pull_request_review: "pull-request-review",
  pull_request_review_comment: "pull-request-review-comment",
  workflow_run: "workflow-run",
  workflow_job: "workflow-job",
  deployment_status: "deployment-status",
  check_run: "check-run",
  check_suite: "check-suite",
};

export function isGitHubSourceOperationSupported(operationId: string): boolean {
  return gitHubSourceOperation(operationId) !== null;
}

export function buildGitHubSourcePlan(operation: ConnectorOperationDefinition): ConnectorRuntimeSourcePlan {
  const sourceOperation = gitHubSourceOperation(operation.id);
  if (!sourceOperation) {
    throw new Error(`Unsupported GitHub source operation: ${operation.id}`);
  }
  return {
    delivery: "webhook",
    dedupe: "delivery",
    hooks: [],
  };
}

function gitHubSourceOperation(operationId: string): GitHubSourceOperation | null {
  const slug = operationId.split(".").at(-1);
  const resolved = slug ? GITHUB_SOURCE_ALIASES[slug] ?? slug : null;
  if (resolved && GITHUB_SOURCE_SET.has(resolved)) return resolved as GitHubSourceOperation;
  return null;
}
