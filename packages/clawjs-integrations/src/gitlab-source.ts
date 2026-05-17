import type {
  ConnectorRuntimeSourcePlan,
} from "./runtime-registry.ts";
import type {
  ConnectorOperationDefinition,
} from "./types.ts";

export const GITLAB_SOURCE_SLUGS = [
  "event",
  "push",
  "tag-push",
  "issue",
  "merge-request",
  "note",
  "job",
  "pipeline",
  "wiki-page",
  "release",
  "deployment",
  "feature-flag",
  "member",
  "subgroup",
  "emoji",
] as const;

type GitLabSourceOperation = typeof GITLAB_SOURCE_SLUGS[number];

const GITLAB_SOURCE_OPERATIONS = new Set<GitLabSourceOperation>(GITLAB_SOURCE_SLUGS);

export function isGitLabSourceOperationSupported(operationId: string): boolean {
  return gitLabSourceOperation(operationId) !== null;
}

export function buildGitLabSourcePlan(operation: ConnectorOperationDefinition): ConnectorRuntimeSourcePlan {
  const sourceOperation = gitLabSourceOperation(operation.id);
  if (!sourceOperation) {
    throw new Error(`Unsupported GitLab source operation: ${operation.id}`);
  }
  return {
    delivery: "webhook",
    dedupe: "object_id",
    hooks: [],
  };
}

function gitLabSourceOperation(operationId: string): GitLabSourceOperation | null {
  const slug = operationId.split(".").at(-1);
  if (GITLAB_SOURCE_OPERATIONS.has(slug as GitLabSourceOperation)) return slug as GitLabSourceOperation;
  if (slug === "tag_push" || slug === "tag") return "tag-push";
  if (slug === "merge_request" || slug === "merge-requests") return "merge-request";
  if (slug === "wiki_page" || slug === "wiki") return "wiki-page";
  if (slug === "feature_flag" || slug === "feature-flag-event") return "feature-flag";
  return null;
}
