import type {
  ConnectorRuntimeRequestPlan,
} from "./runtime-registry.ts";
import type {
  ConnectorOperationDefinition,
  IntegrationJson,
} from "./types.ts";

export type NotionRuntimeOperation =
  | "search"
  | "get-page"
  | "create-page"
  | "update-page"
  | "query-data-source";

export function isNotionActionOperationSupported(operationId: string): boolean {
  return notionRuntimeOperation(operationId) !== null;
}

export function buildNotionOperationRequest(
  operation: ConnectorOperationDefinition,
  values: Record<string, IntegrationJson>,
): ConnectorRuntimeRequestPlan {
  const runtimeOperation = notionRuntimeOperation(operation.id);
  if (!runtimeOperation) {
    throw new Error(`Unsupported Notion operation: ${operation.id}`);
  }
  const auth = operation.authFieldNames.map((field) => ({
    type: "secret" as const,
    field,
    placement: "bearer" as const,
  }));
  const headers = {
    accept: "application/json",
    "notion-version": "2026-03-11",
  };

  switch (runtimeOperation) {
    case "search":
      return {
        method: "POST",
        endpoint: "search",
        auth,
        headers,
        body: removeEmptyValues({
          query: values.query,
          filter: values.filter,
          sort: values.sort,
          page_size: values.pageSize ?? values.page_size,
          start_cursor: values.startCursor ?? values.start_cursor,
        }),
        responseSchema: {
          type: "object",
          requiredPaths: ["object", "results"],
        },
      };
    case "get-page":
      return {
        method: "GET",
        endpoint: `pages/${pathSegment(requiredString(firstValue(values.pageId, values.page_id), "pageId"))}`,
        auth,
        headers,
        body: {},
        responseSchema: {
          type: "object",
          requiredPaths: ["id", "object"],
        },
      };
    case "create-page":
      return {
        method: "POST",
        endpoint: "pages",
        auth,
        headers,
        body: removeEmptyValues({
          parent: pageParent(values),
          properties: pageProperties(values),
          children: values.children,
          icon: values.icon,
          cover: values.cover,
          markdown: values.markdown,
        }),
        responseSchema: {
          type: "object",
          requiredPaths: ["id", "object"],
        },
      };
    case "update-page":
      return {
        method: "PATCH",
        endpoint: `pages/${pathSegment(requiredString(firstValue(values.pageId, values.page_id), "pageId"))}`,
        auth,
        headers,
        body: removeEmptyValues({
          archived: values.archived,
          in_trash: values.inTrash ?? values.in_trash,
          properties: values.properties ?? titleProperties(values.title),
          icon: values.icon,
          cover: values.cover,
        }),
        responseSchema: {
          type: "object",
          requiredPaths: ["id", "object"],
        },
      };
    case "query-data-source":
      return {
        method: "POST",
        endpoint: `data_sources/${pathSegment(requiredString(firstValue(values.dataSourceId, values.data_source_id), "dataSourceId"))}/query`,
        auth,
        headers,
        body: removeEmptyValues({
          filter: values.filter,
          sorts: values.sorts,
          page_size: values.pageSize ?? values.page_size,
          start_cursor: values.startCursor ?? values.start_cursor,
        }),
        responseSchema: {
          type: "object",
          requiredPaths: ["object", "results"],
        },
      };
  }
}

function notionRuntimeOperation(operationId: string): NotionRuntimeOperation | null {
  const slug = operationId.split(".").at(-1);
  if (slug === "search") return "search";
  if (slug === "get-page" || slug === "retrieve-page") return "get-page";
  if (slug === "create-page") return "create-page";
  if (slug === "update-page") return "update-page";
  if (slug === "query-data-source" || slug === "query-database") return "query-data-source";
  return null;
}

function pageParent(values: Record<string, IntegrationJson>): IntegrationJson {
  const dataSourceId = optionalString(firstValue(values.dataSourceId, values.data_source_id));
  if (dataSourceId) return { data_source_id: dataSourceId };
  return { page_id: requiredString(firstValue(values.parentPageId, values.parent_page_id), "parentPageId") };
}

function pageProperties(values: Record<string, IntegrationJson>): IntegrationJson {
  return values.properties ?? titleProperties(requiredString(values.title, "title"));
}

function titleProperties(title: IntegrationJson | undefined): IntegrationJson | undefined {
  const parsed = optionalString(title);
  if (!parsed) return undefined;
  return {
    title: {
      title: [{
        text: { content: parsed },
      }],
    },
  };
}

function firstValue(...values: IntegrationJson[]): IntegrationJson {
  return values.find((value) => value != null && value !== "") ?? null;
}

function requiredString(value: IntegrationJson, name: string): string {
  const parsed = optionalString(value);
  if (!parsed) throw new Error(`Notion ${name} is required`);
  return parsed;
}

function optionalString(value: IntegrationJson): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function pathSegment(value: string): string {
  return encodeURIComponent(value);
}

function removeEmptyValues(input: Record<string, IntegrationJson | undefined>): Record<string, IntegrationJson> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined && value !== ""),
  ) as Record<string, IntegrationJson>;
}
