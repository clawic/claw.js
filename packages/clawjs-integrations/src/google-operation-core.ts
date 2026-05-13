import type {
  ConnectorRuntimePaginationPlan,
} from "./runtime-registry.ts";
import type {
  ConnectorFieldDefinition,
  IntegrationJson,
} from "./types.ts";

export type GoogleField = ConnectorFieldDefinition;

export interface GoogleOperationSpec {
  slug: string;
  method: string;
  endpoint: string;
  fields: GoogleField[];
  query?: string[];
  body?: string[];
  responseType?: "object" | "array" | "string";
  requiredPaths?: string[];
  pagination?: ConnectorRuntimePaginationPlan;
}

export const PAGE = [
  integerField("maxResults", { optional: true, default: 100, min: 1, max: 500 }),
  stringField("pageToken", { optional: true, default: "offline-page-token" }),
];

export const DRIVE_PAGE = [
  integerField("pageSize", { optional: true, default: 100, min: 1, max: 1000 }),
  stringField("pageToken", { optional: true, default: "offline-page-token" }),
];

export const USER = [stringField("userId", { default: "me" })];
export const FILE = [stringField("fileId", { default: "file-123" })];
export const CALENDAR = [stringField("calendarId", { default: "primary" })];
export const SPREADSHEET = [stringField("spreadsheetId", { default: "spreadsheet-123" })];
export const TASKLIST = [stringField("tasklist", { default: "@default" })];

export function spec(
  slug: string,
  method: string,
  endpoint: string,
  fields: GoogleField[],
  options: {
    query?: string[];
    body?: string[];
    responseType?: "object" | "array" | "string";
    requiredPaths?: string[];
    pageItems?: string;
  } = {},
): GoogleOperationSpec {
  return {
    slug,
    method,
    endpoint,
    fields,
    query: options.query,
    body: options.body,
    responseType: options.responseType,
    requiredPaths: options.requiredPaths,
    ...(options.pageItems ? {
      pagination: {
        mode: "cursor",
        itemsPath: options.pageItems,
        nextCursorPath: "nextPageToken",
        cursorParam: "pageToken",
        limitParam: options.query?.includes("pageSize") ? "pageSize" : "maxResults",
        pageSize: 100,
        maxPages: 1,
      },
    } : {}),
  };
}

export function channelFields(): GoogleField[] {
  return [
    stringField("id", { default: "channel-123" }),
    stringField("type", { default: "web_hook" }),
    stringField("address", { default: "https://example.invalid/google/webhook" }),
    stringField("token", { optional: true, default: "offline-token" }),
    stringField("expiration", { optional: true, default: "1893456000000" }),
  ];
}

export function eventFields(): GoogleField[] {
  return [
    stringField("summary", { default: "Planning" }),
    stringField("description", { optional: true, default: "Sample event" }),
    objectField("start", { dateTime: "2026-05-13T09:00:00Z" }),
    objectField("end", { dateTime: "2026-05-13T10:00:00Z" }),
    arrayField("attendees", [{ email: "person@example.invalid" }]),
    stringField("location", { optional: true, default: "Online" }),
  ];
}

export function permissionBodyField(): GoogleField[] {
  return [
    stringField("type", { default: "user" }),
    stringField("role", { default: "reader" }),
    stringField("emailAddress", { optional: true, default: "person@example.invalid" }),
    stringField("domain", { optional: true, default: "example.invalid" }),
    booleanField("allowFileDiscovery", { optional: true, default: false }),
  ];
}

export function stringField(name: string, options: { optional?: boolean; default: string }): GoogleField {
  return { name, type: "string", optional: options.optional ?? false, default: options.default };
}

export function integerField(name: string, options: { optional?: boolean; default: number; min?: number; max?: number }): GoogleField {
  return { name, type: "integer", optional: options.optional ?? false, default: options.default, ...(options.min ? { min: options.min } : {}), ...(options.max ? { max: options.max } : {}) };
}

export function booleanField(name: string, options: { optional?: boolean; default: boolean }): GoogleField {
  return { name, type: "boolean", optional: options.optional ?? false, default: options.default };
}

export function arrayField(name: string, defaultValue: IntegrationJson[]): GoogleField {
  return { name, type: "array", optional: false, default: defaultValue };
}

export function objectField(name: string, defaultValue: Record<string, IntegrationJson>): GoogleField {
  return { name, type: "object", optional: false, default: defaultValue };
}
