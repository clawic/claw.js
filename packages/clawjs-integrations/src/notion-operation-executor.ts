import type {
  ConnectorRuntimeRequestPlan,
} from "./runtime-registry.ts";
import type {
  ConnectorOperationDefinition,
  IntegrationJson,
} from "./types.ts";

type NotionRuntimeOperation =
  | "search"
  | "get-block"
  | "list-block-children"
  | "append-block-children"
  | "update-block"
  | "delete-block"
  | "get-page"
  | "create-page"
  | "update-page"
  | "get-page-property"
  | "get-database"
  | "create-database"
  | "update-database"
  | "get-data-source"
  | "create-data-source"
  | "update-data-source"
  | "query-data-source"
  | "list-data-source-templates"
  | "get-comment"
  | "list-comments"
  | "create-comment"
  | "update-comment"
  | "delete-comment"
  | "list-users"
  | "get-user"
  | "get-self"
  | "list-views"
  | "get-view"
  | "create-view"
  | "update-view"
  | "delete-view"
  | "create-view-query"
  | "get-view-query-results"
  | "delete-view-query"
  | "create-file-upload"
  | "send-file-upload"
  | "complete-file-upload"
  | "get-file-upload"
  | "list-file-uploads"
  | "list-custom-emojis";

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
    case "get-block":
      return {
        method: "GET",
        endpoint: `blocks/${notionId(values, "blockId", "block_id")}`,
        auth,
        headers,
        body: {},
        responseSchema: {
          type: "object",
          requiredPaths: ["id", "object"],
        },
      };
    case "list-block-children":
      return {
        method: "GET",
        endpoint: `blocks/${notionId(values, "blockId", "block_id")}/children`,
        auth,
        headers,
        query: cursorQuery(values),
        body: {},
        pagination: notionCursorPagination("results", values),
        responseSchema: {
          type: "object",
          requiredPaths: ["object", "results"],
        },
      };
    case "append-block-children":
      return {
        method: "PATCH",
        endpoint: `blocks/${notionId(values, "blockId", "block_id")}/children`,
        auth,
        headers,
        body: removeEmptyValues({
          children: requiredJson(values.children, "children"),
          position: values.position,
        }),
        responseSchema: {
          type: "object",
          requiredPaths: ["object", "results"],
        },
      };
    case "update-block":
      return {
        method: "PATCH",
        endpoint: `blocks/${notionId(values, "blockId", "block_id")}`,
        auth,
        headers,
        body: updateBlockBody(values),
        responseSchema: {
          type: "object",
          requiredPaths: ["id", "object"],
        },
      };
    case "delete-block":
      return {
        method: "DELETE",
        endpoint: `blocks/${notionId(values, "blockId", "block_id")}`,
        auth,
        headers,
        body: {},
        responseSchema: {
          type: "object",
          requiredPaths: ["id", "object"],
        },
      };
    case "get-page":
      return {
        method: "GET",
        endpoint: `pages/${notionId(values, "pageId", "page_id")}`,
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
        endpoint: `pages/${notionId(values, "pageId", "page_id")}`,
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
    case "get-page-property":
      return {
        method: "GET",
        endpoint: `pages/${notionId(values, "pageId", "page_id")}/properties/${notionId(values, "propertyId", "property_id")}`,
        auth,
        headers,
        query: cursorQuery(values),
        body: {},
        responseSchema: {
          type: "object",
          requiredPaths: ["object"],
        },
      };
    case "get-database":
      return {
        method: "GET",
        endpoint: `databases/${notionId(values, "databaseId", "database_id")}`,
        auth,
        headers,
        body: {},
        responseSchema: {
          type: "object",
          requiredPaths: ["id", "object"],
        },
      };
    case "create-database":
      return {
        method: "POST",
        endpoint: "databases",
        auth,
        headers,
        body: removeEmptyValues({
          parent: databaseParent(values),
          title: richText(values.title, "title"),
          description: richText(values.description),
          icon: values.icon,
          cover: values.cover,
          initial_data_source: initialNotionSource(values),
        }),
        responseSchema: {
          type: "object",
          requiredPaths: ["id", "object"],
        },
      };
    case "update-database":
      return {
        method: "PATCH",
        endpoint: `databases/${notionId(values, "databaseId", "database_id")}`,
        auth,
        headers,
        body: removeEmptyValues({
          title: richText(values.title),
          description: richText(values.description),
          icon: values.icon,
          cover: values.cover,
          in_trash: values.inTrash ?? values.in_trash,
        }),
        responseSchema: {
          type: "object",
          requiredPaths: ["id", "object"],
        },
      };
    case "get-data-source":
      return {
        method: "GET",
        endpoint: `data_sources/${notionId(values, "dataSourceId", "data_source_id")}`,
        auth,
        headers,
        body: {},
        responseSchema: {
          type: "object",
          requiredPaths: ["id", "object", "properties"],
        },
      };
    case "create-data-source":
      return {
        method: "POST",
        endpoint: "data_sources",
        auth,
        headers,
        body: removeEmptyValues({
          parent: { database_id: requiredString(firstValue(values.databaseId, values.database_id), "databaseId") },
          title: richText(values.title),
          properties: requiredJson(values.properties, "properties"),
          icon: values.icon,
        }),
        responseSchema: {
          type: "object",
          requiredPaths: ["id", "object", "properties"],
        },
      };
    case "update-data-source":
      return {
        method: "PATCH",
        endpoint: `data_sources/${notionId(values, "dataSourceId", "data_source_id")}`,
        auth,
        headers,
        body: removeEmptyValues({
          parent: optionalDatabaseParent(values),
          title: richText(values.title),
          description: richText(values.description),
          properties: values.properties,
          icon: values.icon,
          in_trash: values.inTrash ?? values.in_trash,
        }),
        responseSchema: {
          type: "object",
          requiredPaths: ["id", "object", "properties"],
        },
      };
    case "query-data-source":
      return {
        method: "POST",
        endpoint: `data_sources/${notionId(values, "dataSourceId", "data_source_id")}/query`,
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
    case "list-data-source-templates":
      return {
        method: "GET",
        endpoint: `data_sources/${notionId(values, "dataSourceId", "data_source_id")}/templates`,
        auth,
        headers,
        query: removeEmptyValues({
          name: values.name,
          page_size: values.pageSize ?? values.page_size,
          start_cursor: values.startCursor ?? values.start_cursor,
        }),
        body: {},
        pagination: notionCursorPagination("templates", values),
        responseSchema: {
          type: "object",
          requiredPaths: ["templates", "has_more", "next_cursor"],
        },
      };
    case "get-comment":
      return {
        method: "GET",
        endpoint: `comments/${notionId(values, "commentId", "comment_id")}`,
        auth,
        headers,
        body: {},
        responseSchema: {
          type: "object",
          requiredPaths: ["id", "object"],
        },
      };
    case "list-comments":
      return {
        method: "GET",
        endpoint: "comments",
        auth,
        headers,
        query: removeEmptyValues({
          block_id: requiredString(firstValue(values.blockId, values.block_id, values.pageId, values.page_id), "blockId"),
          page_size: values.pageSize ?? values.page_size,
          start_cursor: values.startCursor ?? values.start_cursor,
        }),
        body: {},
        pagination: notionCursorPagination("results", values),
        responseSchema: {
          type: "object",
          requiredPaths: ["object", "results"],
        },
      };
    case "create-comment":
      return {
        method: "POST",
        endpoint: "comments",
        auth,
        headers,
        body: createCommentBody(values),
        responseSchema: {
          type: "object",
          requiredPaths: ["id", "object"],
        },
      };
    case "update-comment":
      return {
        method: "PATCH",
        endpoint: `comments/${notionId(values, "commentId", "comment_id")}`,
        auth,
        headers,
        body: {
          rich_text: requiredJson(richText(values.richText ?? values.text, "richText"), "richText"),
        },
        responseSchema: {
          type: "object",
          requiredPaths: ["id", "object"],
        },
      };
    case "delete-comment":
      return {
        method: "DELETE",
        endpoint: `comments/${notionId(values, "commentId", "comment_id")}`,
        auth,
        headers,
        body: {},
        responseSchema: {
          type: "object",
          requiredPaths: ["id", "object"],
        },
      };
    case "list-users":
      return {
        method: "GET",
        endpoint: "users",
        auth,
        headers,
        query: cursorQuery(values),
        body: {},
        pagination: notionCursorPagination("results", values),
        responseSchema: {
          type: "object",
          requiredPaths: ["object", "results"],
        },
      };
    case "get-user":
      return {
        method: "GET",
        endpoint: `users/${notionId(values, "userId", "user_id")}`,
        auth,
        headers,
        body: {},
        responseSchema: {
          type: "object",
          requiredPaths: ["id", "object"],
        },
      };
    case "get-self":
      return {
        method: "GET",
        endpoint: "users/me",
        auth,
        headers,
        body: {},
        responseSchema: {
          type: "object",
          requiredPaths: ["id", "object"],
        },
      };
    case "list-views":
      return {
        method: "GET",
        endpoint: "views",
        auth,
        headers,
        query: removeEmptyValues({
          database_id: values.databaseId ?? values.database_id,
          data_source_id: values.dataSourceId ?? values.data_source_id,
          page_size: values.pageSize ?? values.page_size,
          start_cursor: values.startCursor ?? values.start_cursor,
        }),
        body: {},
        pagination: notionCursorPagination("results", values),
        responseSchema: {
          type: "object",
          requiredPaths: ["object", "results"],
        },
      };
    case "get-view":
      return {
        method: "GET",
        endpoint: `views/${notionId(values, "viewId", "view_id")}`,
        auth,
        headers,
        body: {},
        responseSchema: {
          type: "object",
          requiredPaths: ["id", "object", "type"],
        },
      };
    case "create-view":
      return {
        method: "POST",
        endpoint: "views",
        auth,
        headers,
        body: removeEmptyValues({
          database_id: values.databaseId ?? values.database_id,
          data_source_id: requiredString(firstValue(values.dataSourceId, values.data_source_id), "dataSourceId"),
          view_id: values.viewId ?? values.view_id,
          create_database: values.createDatabase ?? values.create_database,
          name: requiredString(values.name, "name"),
          type: requiredString(values.type, "type"),
          filter: values.filter,
          sorts: values.sorts,
          configuration: values.configuration,
          position: values.position,
        }),
        responseSchema: {
          type: "object",
          requiredPaths: ["id", "object", "type"],
        },
      };
    case "update-view":
      return {
        method: "PATCH",
        endpoint: `views/${notionId(values, "viewId", "view_id")}`,
        auth,
        headers,
        body: removeEmptyValues({
          name: values.name,
          filter: values.filter,
          sorts: values.sorts,
          configuration: values.configuration,
        }),
        responseSchema: {
          type: "object",
          requiredPaths: ["id", "object", "type"],
        },
      };
    case "delete-view":
      return {
        method: "DELETE",
        endpoint: `views/${notionId(values, "viewId", "view_id")}`,
        auth,
        headers,
        body: {},
        responseSchema: {
          type: "object",
          requiredPaths: ["id", "object", "type"],
        },
      };
    case "create-view-query":
      return {
        method: "POST",
        endpoint: `views/${notionId(values, "viewId", "view_id")}/queries`,
        auth,
        headers,
        body: removeEmptyValues({
          page_size: values.pageSize ?? values.page_size,
        }),
        responseSchema: {
          type: "object",
          requiredPaths: ["object", "results", "query_id"],
        },
      };
    case "get-view-query-results":
      return {
        method: "GET",
        endpoint: `views/${notionId(values, "viewId", "view_id")}/queries/${notionId(values, "queryId", "query_id")}/results`,
        auth,
        headers,
        query: cursorQuery(values),
        body: {},
        pagination: notionCursorPagination("results", values),
        responseSchema: {
          type: "object",
          requiredPaths: ["object", "results"],
        },
      };
    case "delete-view-query":
      return {
        method: "DELETE",
        endpoint: `views/${notionId(values, "viewId", "view_id")}/queries/${notionId(values, "queryId", "query_id")}`,
        auth,
        headers,
        body: {},
        responseSchema: {
          type: "object",
          requiredPaths: ["id", "object"],
        },
      };
    case "create-file-upload":
      return {
        method: "POST",
        endpoint: "file_uploads",
        auth,
        headers,
        body: removeEmptyValues({
          mode: values.mode,
          filename: values.filename,
          content_type: values.contentType ?? values.content_type,
          content_length: values.contentLength ?? values.content_length,
          number_of_parts: values.numberOfParts ?? values.number_of_parts,
          external_url: values.externalUrl ?? values.external_url,
        }),
        responseSchema: {
          type: "object",
          requiredPaths: ["id", "object", "status"],
        },
      };
    case "send-file-upload":
      return {
        method: "POST",
        endpoint: `file_uploads/${notionId(values, "fileUploadId", "file_upload_id")}/send`,
        auth,
        headers,
        bodyEncoding: "multipart",
        body: removeEmptyValues({
          file: requiredJson(values.file, "file"),
          part_number: values.partNumber ?? values.part_number,
        }),
        responseSchema: {
          type: "object",
          requiredPaths: ["id", "object", "status"],
        },
      };
    case "complete-file-upload":
      return {
        method: "POST",
        endpoint: `file_uploads/${notionId(values, "fileUploadId", "file_upload_id")}/complete`,
        auth,
        headers,
        body: {},
        responseSchema: {
          type: "object",
          requiredPaths: ["id", "object", "status"],
        },
      };
    case "get-file-upload":
      return {
        method: "GET",
        endpoint: `file_uploads/${notionId(values, "fileUploadId", "file_upload_id")}`,
        auth,
        headers,
        body: {},
        responseSchema: {
          type: "object",
          requiredPaths: ["id", "object", "status"],
        },
      };
    case "list-file-uploads":
      return {
        method: "GET",
        endpoint: "file_uploads",
        auth,
        headers,
        query: removeEmptyValues({
          status: values.status,
          page_size: values.pageSize ?? values.page_size,
          start_cursor: values.startCursor ?? values.start_cursor,
        }),
        body: {},
        pagination: notionCursorPagination("results", values),
        responseSchema: {
          type: "object",
          requiredPaths: ["object", "results"],
        },
      };
    case "list-custom-emojis":
      return {
        method: "GET",
        endpoint: "custom_emojis",
        auth,
        headers,
        query: removeEmptyValues({
          name: values.name,
          page_size: values.pageSize ?? values.page_size,
          start_cursor: values.startCursor ?? values.start_cursor,
        }),
        body: {},
        pagination: notionCursorPagination("results", values),
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
  if (slug === "get-block" || slug === "retrieve-block") return "get-block";
  if (slug === "list-block-children" || slug === "retrieve-block-children" || slug === "get-block-children") return "list-block-children";
  if (slug === "append-block-children") return "append-block-children";
  if (slug === "update-block") return "update-block";
  if (slug === "delete-block") return "delete-block";
  if (slug === "get-page" || slug === "retrieve-page") return "get-page";
  if (slug === "create-page") return "create-page";
  if (slug === "update-page") return "update-page";
  if (slug === "get-page-property" || slug === "retrieve-page-property") return "get-page-property";
  if (slug === "get-database" || slug === "retrieve-database") return "get-database";
  if (slug === "create-database") return "create-database";
  if (slug === "update-database") return "update-database";
  if (slug === "get-data-source" || slug === "retrieve-data-source") return "get-data-source";
  if (slug === "create-data-source") return "create-data-source";
  if (slug === "update-data-source") return "update-data-source";
  if (slug === "query-data-source" || slug === "query-database") return "query-data-source";
  if (slug === "list-data-source-templates") return "list-data-source-templates";
  if (slug === "get-comment" || slug === "retrieve-comment") return "get-comment";
  if (slug === "list-comments") return "list-comments";
  if (slug === "create-comment") return "create-comment";
  if (slug === "update-comment") return "update-comment";
  if (slug === "delete-comment") return "delete-comment";
  if (slug === "list-users") return "list-users";
  if (slug === "get-user" || slug === "retrieve-user") return "get-user";
  if (slug === "get-self" || slug === "retrieve-self" || slug === "get-bot-user") return "get-self";
  if (slug === "list-views") return "list-views";
  if (slug === "get-view" || slug === "retrieve-view") return "get-view";
  if (slug === "create-view") return "create-view";
  if (slug === "update-view") return "update-view";
  if (slug === "delete-view") return "delete-view";
  if (slug === "create-view-query") return "create-view-query";
  if (slug === "get-view-query-results" || slug === "list-view-query-results") return "get-view-query-results";
  if (slug === "delete-view-query") return "delete-view-query";
  if (slug === "create-file-upload") return "create-file-upload";
  if (slug === "send-file-upload") return "send-file-upload";
  if (slug === "complete-file-upload") return "complete-file-upload";
  if (slug === "get-file-upload" || slug === "retrieve-file-upload") return "get-file-upload";
  if (slug === "list-file-uploads") return "list-file-uploads";
  if (slug === "list-custom-emojis") return "list-custom-emojis";
  return null;
}

function notionId(values: Record<string, IntegrationJson>, camelName: string, snakeName: string): string {
  return pathSegment(requiredString(firstValue(values[camelName], values[snakeName]), camelName));
}

function pageParent(values: Record<string, IntegrationJson>): IntegrationJson {
  const dataSourceId = optionalString(firstValue(values.dataSourceId, values.data_source_id));
  if (dataSourceId) return { data_source_id: dataSourceId };
  return { page_id: requiredString(firstValue(values.parentPageId, values.parent_page_id), "parentPageId") };
}

function pageProperties(values: Record<string, IntegrationJson>): IntegrationJson {
  return values.properties ?? titleProperties(requiredString(values.title, "title"));
}

function databaseParent(values: Record<string, IntegrationJson>): IntegrationJson {
  const pageId = optionalString(firstValue(values.parentPageId, values.parent_page_id));
  if (pageId) return { page_id: pageId };
  if (values.workspace === true) return { workspace: true };
  return { page_id: requiredString(firstValue(values.pageId, values.page_id), "pageId") };
}

function optionalDatabaseParent(values: Record<string, IntegrationJson>): IntegrationJson | undefined {
  const databaseId = optionalString(firstValue(values.databaseId, values.database_id));
  return databaseId ? { database_id: databaseId } : undefined;
}

function initialNotionSource(values: Record<string, IntegrationJson>): IntegrationJson {
  return values.initialNotionSource ?? values.initial_data_source ?? removeEmptyValues({
    title: richText(values.dataSourceTitle ?? values.title),
    properties: requiredJson(values.properties, "properties"),
  });
}

function titleProperties(title: IntegrationJson | undefined): IntegrationJson {
  const parsed = requiredString(title, "title");
  return {
    title: {
      title: [{
        text: { content: parsed },
      }],
    },
  };
}

function cursorQuery(values: Record<string, IntegrationJson>): Record<string, IntegrationJson> {
  return removeEmptyValues({
    page_size: values.pageSize ?? values.page_size,
    start_cursor: values.startCursor ?? values.start_cursor,
  });
}

function notionCursorPagination(itemsPath: string, values: Record<string, IntegrationJson>) {
  return {
    mode: "cursor" as const,
    itemsPath,
    nextCursorPath: "next_cursor",
    cursorParam: "start_cursor",
    limitParam: "page_size",
    pageSize: numberValue(values.pageSize ?? values.page_size),
  };
}

function updateBlockBody(values: Record<string, IntegrationJson>): Record<string, IntegrationJson> {
  if (values.block && typeof values.block === "object" && !Array.isArray(values.block)) {
    return values.block as Record<string, IntegrationJson>;
  }
  const type = requiredString(values.type, "type");
  const typedBody = values[type];
  return removeEmptyValues({
    [type]: requiredJson(typedBody, type),
    archived: values.archived,
    in_trash: values.inTrash ?? values.in_trash,
  });
}

function createCommentBody(values: Record<string, IntegrationJson>): Record<string, IntegrationJson> {
  const discussionId = optionalString(firstValue(values.discussionId, values.discussion_id));
  if (discussionId) {
    return removeEmptyValues({
      discussion_id: discussionId,
      rich_text: richText(values.richText ?? values.text, "richText"),
      attachments: values.attachments,
      display_name: values.displayName ?? values.display_name,
    });
  }
  return removeEmptyValues({
    parent: commentParent(values),
    rich_text: richText(values.richText ?? values.text, "richText"),
    attachments: values.attachments,
    display_name: values.displayName ?? values.display_name,
  });
}

function commentParent(values: Record<string, IntegrationJson>): IntegrationJson {
  const pageId = optionalString(firstValue(values.pageId, values.page_id));
  if (pageId) return { page_id: pageId };
  return { block_id: requiredString(firstValue(values.blockId, values.block_id), "blockId") };
}

function richText(value: IntegrationJson | undefined, name?: string): IntegrationJson | undefined {
  if (Array.isArray(value)) return value;
  const parsed = optionalString(value);
  if (!parsed) {
    if (name) throw new Error(`Notion ${name} is required`);
    return undefined;
  }
  return [{
    text: { content: parsed },
  }];
}

function requiredJson(value: IntegrationJson | undefined, name: string): IntegrationJson {
  if (value == null || value === "") throw new Error(`Notion ${name} is required`);
  return value;
}

function firstValue(...values: Array<IntegrationJson | undefined>): IntegrationJson {
  return values.find((value) => value != null && value !== "") ?? null;
}

function requiredString(value: IntegrationJson | undefined, name: string): string {
  const parsed = optionalString(value);
  if (!parsed) throw new Error(`Notion ${name} is required`);
  return parsed;
}

function optionalString(value: IntegrationJson | undefined): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function pathSegment(value: string): string {
  return encodeURIComponent(value);
}

function numberValue(value: IntegrationJson | undefined): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function removeEmptyValues(input: Record<string, IntegrationJson | undefined>): Record<string, IntegrationJson> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined && value !== ""),
  ) as Record<string, IntegrationJson>;
}
