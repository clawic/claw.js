import type {
  ConnectorRuntimeRequestPlan,
} from "./runtime-registry.ts";
import type {
  ConnectorOperationDefinition,
  IntegrationJson,
} from "./types.ts";

export type GitHubRuntimeOperation =
  | "get-issue"
  | "list-repository-issues"
  | "create-issue"
  | "create-issue-comment";

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
  const owner = pathSegment(requiredString(firstValue(values.owner, values.repositoryOwner), "owner"));
  const repo = pathSegment(requiredString(firstValue(values.repo, values.repository), "repo"));
  const headers = {
    accept: "application/vnd.github+json",
    "x-github-api-version": "2026-03-10",
  };

  switch (runtimeOperation) {
    case "get-issue": {
      const issueNumber = pathSegment(requiredNumberString(firstValue(values.issueNumber, values.issue_number), "issueNumber"));
      return {
        method: "GET",
        endpoint: `repos/${owner}/${repo}/issues/${issueNumber}`,
        auth,
        headers,
        body: {},
        responseSchema: {
          type: "object",
          requiredPaths: ["id", "number", "title"],
        },
      };
    }
    case "list-repository-issues":
      return {
        method: "GET",
        endpoint: `repos/${owner}/${repo}/issues`,
        auth,
        headers,
        query: removeEmptyValues({
          state: values.state ?? "open",
          labels: values.labels,
          sort: values.sort,
          direction: values.direction,
          since: values.since,
          per_page: values.perPage ?? values.per_page ?? 30,
          page: values.page ?? 1,
        }),
        body: {},
        pagination: {
          mode: "offset",
          itemsPath: "",
          offsetParam: "page",
          limitParam: "per_page",
          pageSize: numberValue(values.perPage ?? values.per_page) ?? 30,
          maxPages: numberValue(values.maxPages) ?? 1,
        },
        responseSchema: {
          type: "array",
        },
      };
    case "create-issue":
      return {
        method: "POST",
        endpoint: `repos/${owner}/${repo}/issues`,
        auth,
        headers,
        body: removeEmptyValues({
          title: requiredString(values.title, "title"),
          body: values.body,
          assignees: values.assignees,
          labels: values.labels,
          milestone: values.milestone,
        }),
        responseSchema: {
          type: "object",
          requiredPaths: ["id", "number", "title"],
        },
      };
    case "create-issue-comment": {
      const issueNumber = pathSegment(requiredNumberString(firstValue(values.issueNumber, values.issue_number), "issueNumber"));
      return {
        method: "POST",
        endpoint: `repos/${owner}/${repo}/issues/${issueNumber}/comments`,
        auth,
        headers,
        body: {
          body: requiredString(values.body, "body"),
        },
        responseSchema: {
          type: "object",
          requiredPaths: ["id", "body"],
        },
      };
    }
  }
}

function gitHubRuntimeOperation(operationId: string): GitHubRuntimeOperation | null {
  const slug = operationId.split(".").at(-1);
  if (slug === "get-issue" || slug === "find-issue") return "get-issue";
  if (slug === "list-repository-issues" || slug === "list-issues") return "list-repository-issues";
  if (slug === "create-issue" || slug === "open-issue") return "create-issue";
  if (slug === "create-issue-comment" || slug === "add-comment") return "create-issue-comment";
  return null;
}

function firstValue(...values: IntegrationJson[]): IntegrationJson {
  return values.find((value) => value != null && value !== "") ?? null;
}

function requiredString(value: IntegrationJson, name: string): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  throw new Error(`GitHub ${name} is required`);
}

function requiredNumberString(value: IntegrationJson, name: string): string {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return String(value);
  if (typeof value === "string" && /^[1-9]\d*$/.test(value.trim())) return value.trim();
  throw new Error(`GitHub ${name} must be a positive integer`);
}

function pathSegment(value: string): string {
  return encodeURIComponent(value);
}

function numberValue(value: IntegrationJson): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function removeEmptyValues(input: Record<string, IntegrationJson | undefined>): Record<string, IntegrationJson> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined && value !== ""),
  ) as Record<string, IntegrationJson>;
}
