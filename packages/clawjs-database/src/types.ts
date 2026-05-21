import type { clawDatabaseRecordEvents } from "@clawjs/core";

export type DatabaseRecordChangeEventType =
  (typeof clawDatabaseRecordEvents)[keyof typeof clawDatabaseRecordEvents];

export type FieldType =
  | "text"
  | "number"
  | "boolean"
  | "date"
  | "json"
  | "select"
  | "relation"
  | "file"
  | "email"
  | "url"
  | "money"
  | "currency"
  | "address"
  | "phone"
  | "geo_point"
  | "rating"
  | "duration"
  | "percent"
  | "markdown"
  | "color_hex"
  | "barcode";

export type BarcodeKind = "isbn10" | "isbn13" | "ean13" | "upc12" | "qr_text" | "generic";

export type DurationDisplayUnit = "second" | "minute" | "hour" | "day";

export type DatabaseOperation =
  | "schema:read"
  | "schema:write"
  | "records:list"
  | "records:read"
  | "records:create"
  | "records:update"
  | "records:delete"
  | "files:read"
  | "files:write"
  | "realtime:subscribe"
  | "tokens:issue"
  | "tokens:revoke";

export interface FieldDefinition {
  name: string;
  type: FieldType;
  required?: boolean;
  options?: string[];
  relation?: {
    collectionName: string;
  };
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  unique?: boolean;
  enumScale?: number;
  barcodeKind?: BarcodeKind;
  durationDisplayUnit?: DurationDisplayUnit;
}

export type CollectionRule =
  | { kind: "compare_dates"; left: string; op: "<" | "<=" | "==" | ">=" | ">"; right: string; message?: string }
  | { kind: "required_if"; field: string; whenField: string; whenEquals: unknown; message?: string }
  | { kind: "number_compare"; left: string; op: "<" | "<=" | "==" | ">=" | ">"; right: string | number; message?: string }
  | { kind: "regex"; field: string; pattern: string; message?: string };

export interface IndexDefinition {
  name: string;
  fields: string[];
  unique?: boolean;
}

export interface CollectionDefinition {
  namespaceId: string;
  name: string;
  displayName: string;
  fields: FieldDefinition[];
  indexes: IndexDefinition[];
  builtin: boolean;
  protected: boolean;
  coreFieldNames: string[];
  rules?: CollectionRule[];
  createdAt: string;
  updatedAt: string;
}

export interface RecordEnvelope {
  id: string;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

export interface ListRecordsOptions {
  filter?: Record<string, unknown>;
  sort?: string;
  limit?: number;
  offset?: number;
  maxLimit?: number;
}

export interface DatabaseStorageOperationMetric {
  count: number;
  errors: number;
  slowCount: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  lastMs: number;
}

export interface DatabaseStorageMetrics {
  queueDepth: number;
  operations: Record<string, DatabaseStorageOperationMetric>;
}

export interface NamespaceRecord {
  id: string;
  displayName: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScopedTokenRecord {
  id: string;
  label: string;
  namespaceId: string;
  collectionName?: string | null;
  operations: DatabaseOperation[];
  createdAt: string;
  lastUsedAt?: string | null;
  revokedAt?: string | null;
}

export interface FileAsset {
  id: string;
  namespaceId: string;
  collectionName?: string | null;
  recordId?: string | null;
  filename: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
  downloadPath: string;
}

export interface RecordChangeEvent {
  type: DatabaseRecordChangeEventType;
  namespaceId: string;
  collectionName: string;
  recordId: string;
  record?: RecordEnvelope;
  at: string;
}

export interface AccessPolicy {
  namespaceId: string;
  collectionName?: string | null;
  operations: DatabaseOperation[];
}
