import type {
  ConnectorRuntimePaginationPlan,
  ConnectorRuntimeQuerySerialization,
} from "./runtime-registry.ts";
import type {
  ConnectorFieldDefinition,
  IntegrationJson,
} from "./types.ts";

export type AirtableField = ConnectorFieldDefinition;

export interface AirtableOperationSpec {
  slug: string;
  method: string;
  endpoint: string;
  fields: AirtableField[];
  query?: string[];
  querySerialization?: Record<string, ConnectorRuntimeQuerySerialization>;
  body?: string[];
  responseType?: "object" | "array" | "string";
  requiredPaths?: string[];
  pagination?: ConnectorRuntimePaginationPlan;
}

export const BASE = [stringField("baseId", { default: "appBase123" })] as const;
export const TABLE = [
  ...BASE,
  stringField("tableIdOrName", { default: "tblTable123" }),
] as const;
export const RECORD = [
  ...TABLE,
  stringField("recordId", { default: "recRecord123" }),
] as const;
export const COMMENT = [
  ...RECORD,
  stringField("commentId", { default: "comComment123" }),
] as const;
export const WEBHOOK = [
  ...BASE,
  stringField("webhookId", { default: "achWebhook123" }),
] as const;

const RECORD_PAGE = [
  integerField("pageSize", { optional: true, default: 100, min: 1, max: 100 }),
  stringField("offset", { optional: true, default: "itrOffset123" }),
] as const;

export const RECORD_LIST_FIELDS = [
  ...TABLE,
  ...RECORD_PAGE,
  stringField("view", { optional: true, default: "Grid view" }),
  arrayField("fields", ["Name", "Status"], { optional: true }),
  stringField("filterByFormula", { optional: true, default: "{Status} = 'Open'" }),
  arrayField("sort", [{ field: "Name", direction: "asc" }], { optional: true }),
  stringField("cellFormat", { optional: true, default: "json" }),
  stringField("timeZone", { optional: true, default: "UTC" }),
  stringField("userLocale", { optional: true, default: "en-us" }),
  booleanField("returnFieldsByFieldId", { optional: true, default: false }),
] as const;

export function spec(
  slug: string,
  method: string,
  endpoint: string,
  fields: readonly AirtableField[],
  options: {
    query?: string[];
    body?: string[];
    responseType?: "object" | "array" | "string";
    requiredPaths?: string[];
    paginateRecords?: boolean;
    querySerialization?: Record<string, ConnectorRuntimeQuerySerialization>;
  } = {},
): AirtableOperationSpec {
  return {
    slug,
    method,
    endpoint,
    fields: [...fields],
    query: options.query,
    querySerialization: options.querySerialization,
    body: options.body,
    responseType: options.responseType,
    requiredPaths: options.requiredPaths,
    ...(options.paginateRecords ? {
      pagination: {
        mode: "cursor",
        itemsPath: "records",
        nextCursorPath: "offset",
        cursorParam: "offset",
        limitParam: "pageSize",
        pageSize: 100,
        maxPages: 1,
      },
    } : {}),
  };
}

export function recordBodyFields(options: { bulk?: boolean; optionalFields?: boolean } = {}): AirtableField[] {
  return [
    ...(options.bulk ? [arrayField("records", [{
      id: "recRecord123",
      fields: { Name: "Sample", Status: "Open" },
    }])] : [objectField("fields", { Name: "Sample", Status: "Open" }, { optional: options.optionalFields })]),
    booleanField("typecast", { optional: true, default: false }),
    booleanField("returnFieldsByFieldId", { optional: true, default: false }),
  ];
}

export function baseBodyFields(): AirtableField[] {
  return [
    stringField("name", { default: "Sample Base" }),
    stringField("workspaceId", { default: "wspWorkspace123" }),
    arrayField("tables", [{
      name: "Tasks",
      fields: [{ name: "Name", type: "singleLineText" }],
    }]),
  ];
}

export function tableBodyFields(options: { optional?: boolean } = {}): AirtableField[] {
  return [
    stringField("name", { default: "Tasks", optional: options.optional }),
    stringField("description", { default: "Tracked work", optional: true }),
    arrayField("fields", [{ name: "Name", type: "singleLineText" }], { optional: options.optional }),
  ];
}

export function fieldBodyFields(options: { optional?: boolean } = {}): AirtableField[] {
  return [
    stringField("name", { default: "Status", optional: options.optional }),
    stringField("type", { default: "singleSelect", optional: options.optional }),
    stringField("description", { default: "Current status", optional: true }),
    objectField("options", { choices: [{ name: "Open", color: "greenBright" }] }, { optional: true }),
  ];
}

export function webhookBodyFields(): AirtableField[] {
  return [
    stringField("notificationUrl", { default: "https://example.invalid/airtable/webhook" }),
    objectField("specification", {
      options: {
        filters: {
          dataTypes: ["tableData"],
          recordChangeScope: "tblTable123",
        },
      },
    }),
  ];
}

export function stringField(name: string, options: { optional?: boolean; default: string }): AirtableField {
  return { name, type: "string", optional: options.optional ?? false, default: options.default };
}

function integerField(name: string, options: { optional?: boolean; default: number; min?: number; max?: number }): AirtableField {
  return { name, type: "integer", optional: options.optional ?? false, default: options.default, ...(options.min ? { min: options.min } : {}), ...(options.max ? { max: options.max } : {}) };
}

export function booleanField(name: string, options: { optional?: boolean; default: boolean }): AirtableField {
  return { name, type: "boolean", optional: options.optional ?? false, default: options.default };
}

export function arrayField(name: string, defaultValue: IntegrationJson[], options: { optional?: boolean } = {}): AirtableField {
  return { name, type: "array", optional: options.optional ?? false, default: defaultValue };
}

export function objectField(name: string, defaultValue: Record<string, IntegrationJson>, options: { optional?: boolean } = {}): AirtableField {
  return { name, type: "object", optional: options.optional ?? false, default: defaultValue };
}
