import type {
  ConnectorRuntimeSourcePlan,
} from "./runtime-registry.ts";
import type {
  ConnectorOperationDefinition,
} from "./types.ts";

export type GitHubSourceOperation =
  | "webhook-event"
  | "push"
  | "issues"
  | "pull-request"
  | "workflow-run"
  | "release";

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
  if (slug === "webhook-event" || slug === "event") return "webhook-event";
  if (slug === "push") return "push";
  if (slug === "issues") return "issues";
  if (slug === "pull-request" || slug === "pull_request") return "pull-request";
  if (slug === "workflow-run" || slug === "workflow_run") return "workflow-run";
  if (slug === "release") return "release";
  return null;
}
