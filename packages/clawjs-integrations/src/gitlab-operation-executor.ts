import type {
  ConnectorRuntimeRequestPlan,
} from "./runtime-registry.ts";
import type {
  ConnectorOperationDefinition,
  IntegrationJson,
} from "./types.ts";

export type GitLabRuntimeOperation =
  | "list-project-issues"
  | "get-project-issue"
  | "create-issue"
  | "update-issue"
  | "create-issue-note";

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
  const projectId = pathSegment(requiredString(firstValue(values.projectId, values.project, values.id), "projectId"));

  switch (runtimeOperation) {
    case "list-project-issues":
      return {
        method: "GET",
        endpoint: `projects/${projectId}/issues`,
        auth,
        headers,
        query: removeEmptyValues({
          state: values.state ?? "opened",
          labels: values.labels,
          search: values.search,
          scope: values.scope,
          order_by: values.orderBy ?? values.order_by,
          sort: values.sort,
          per_page: values.perPage ?? values.per_page ?? 20,
          page: values.page ?? 1,
        }),
        body: {},
        pagination: {
          mode: "offset",
          itemsPath: "",
          offsetParam: "page",
          limitParam: "per_page",
          pageSize: numberValue(values.perPage ?? values.per_page) ?? 20,
          maxPages: numberValue(values.maxPages) ?? 1,
        },
        responseSchema: {
          type: "array",
        },
      };
    case "get-project-issue":
      return {
        method: "GET",
        endpoint: `projects/${projectId}/issues/${pathSegment(requiredNumberString(firstValue(values.issueIid, values.issue_iid), "issueIid"))}`,
        auth,
        headers,
        body: {},
        responseSchema: {
          type: "object",
          requiredPaths: ["id", "iid", "title"],
        },
      };
    case "create-issue":
      return {
        method: "POST",
        endpoint: `projects/${projectId}/issues`,
        auth,
        headers,
        body: removeEmptyValues({
          title: requiredString(values.title, "title"),
          description: values.description ?? values.body,
          labels: values.labels,
          assignee_ids: values.assigneeIds ?? values.assignee_ids,
          confidential: values.confidential,
          due_date: values.dueDate ?? values.due_date,
          issue_type: values.issueType ?? values.issue_type,
          milestone_id: values.milestoneId ?? values.milestone_id,
          weight: values.weight,
        }),
        responseSchema: {
          type: "object",
          requiredPaths: ["id", "iid", "title"],
        },
      };
    case "update-issue":
      return {
        method: "PUT",
        endpoint: `projects/${projectId}/issues/${pathSegment(requiredNumberString(firstValue(values.issueIid, values.issue_iid), "issueIid"))}`,
        auth,
        headers,
        body: removeEmptyValues({
          title: values.title,
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
        }),
        responseSchema: {
          type: "object",
          requiredPaths: ["id", "iid", "title"],
        },
      };
    case "create-issue-note":
      return {
        method: "POST",
        endpoint: `projects/${projectId}/issues/${pathSegment(requiredNumberString(firstValue(values.issueIid, values.issue_iid), "issueIid"))}/notes`,
        auth,
        headers,
        body: removeEmptyValues({
          body: requiredString(values.body, "body"),
          internal: values.internal,
        }),
        responseSchema: {
          type: "object",
          requiredPaths: ["id", "body"],
        },
      };
  }
}

function gitLabRuntimeOperation(operationId: string): GitLabRuntimeOperation | null {
  const slug = operationId.split(".").at(-1);
  if (slug === "list-project-issues" || slug === "list-issues") return "list-project-issues";
  if (slug === "get-project-issue" || slug === "get-issue") return "get-project-issue";
  if (slug === "create-issue") return "create-issue";
  if (slug === "update-issue") return "update-issue";
  if (slug === "create-issue-note" || slug === "add-issue-note") return "create-issue-note";
  return null;
}

function firstValue(...values: IntegrationJson[]): IntegrationJson {
  return values.find((value) => value != null && value !== "") ?? null;
}

function requiredString(value: IntegrationJson, name: string): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  throw new Error(`GitLab ${name} is required`);
}

function requiredNumberString(value: IntegrationJson, name: string): string {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return String(value);
  if (typeof value === "string" && /^[1-9]\d*$/.test(value.trim())) return value.trim();
  throw new Error(`GitLab ${name} must be a positive integer`);
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
