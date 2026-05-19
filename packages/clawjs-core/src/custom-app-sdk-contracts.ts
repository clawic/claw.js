import { z } from "zod";

import {
  resourceKindSchema,
  resourceRecordSchema,
  resourceStatusSchema,
} from "./cli-guidance.ts";
import { CUSTOM_APP_REDACTION_POLICY_ID } from "./custom-app-redaction-policy.ts";

export const CUSTOM_APP_SDK_SCHEMA_REFS = {
  searchQuery: "claw.search.query.v1",
  searchResults: "claw.search.results.v1",
  dbQuery: "claw.db.query.v1",
  dbRecords: "claw.db.records.v1",
  resourcesList: "claw.resources.list.v1",
  resourcesListResult: "claw.resources.listResult.v1",
  resourcesRead: "claw.resources.read.v1",
  resourcesPayload: "claw.resources.payload.v1",
  requestCancel: "claw.customApp.request.cancel.v1",
  requestProgress: "claw.customApp.request.progress.v1",
  requestPartial: "claw.customApp.request.partial.v1",
} as const;

export type CustomAppSDKSchemaRef = typeof CUSTOM_APP_SDK_SCHEMA_REFS[keyof typeof CUSTOM_APP_SDK_SCHEMA_REFS];

const stringArraySchema = z.array(z.string().min(1)).default([]);

export const customAppSDKRequestCancelSchema = z.object({
  requestId: z.string().min(1),
}).strict();

export const customAppSDKRequestProgressSchema = z.object({
  message: z.string().min(1),
  progress: z.number().min(0).max(1).optional(),
  partialCount: z.number().int().min(0).optional(),
}).strict();

export const customAppSDKFacetBucketSchema = z.object({
  value: z.string(),
  count: z.number().int().min(0),
}).strict();

export const customAppSDKBridgeRecordSchema = z.object({
  id: z.string().min(1),
  collection: z.string().min(1),
  title: z.string().optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  data: z.record(z.unknown()),
  redactedFields: z.array(z.string()),
  redactionPolicy: z.literal(CUSTOM_APP_REDACTION_POLICY_ID),
}).strict();

export const customAppSDKDBFilterOperatorSchema = z.object({
  neq: z.unknown().optional(),
  isNull: z.boolean().optional(),
}).strict();

export const customAppSDKDBQuerySchema = z.object({
  collection: z.string().min(1),
  filter: z.record(z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    customAppSDKDBFilterOperatorSchema,
  ])).default({}),
  search: z.string().optional(),
  query: z.string().optional(),
  sort: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).max(10_000).optional(),
  cursor: z.string().min(1).optional(),
  facets: stringArraySchema,
}).strict();

export const customAppSDKDBRecordsSchema = z.object({
  collection: z.string().min(1),
  items: z.array(customAppSDKBridgeRecordSchema),
  limit: z.number().int().min(1).max(100),
  offset: z.number().int().min(0),
  total: z.number().int().min(0).optional(),
  nextCursor: z.string().nullable(),
  facets: z.record(z.array(customAppSDKFacetBucketSchema)),
  source: z.literal("db.query"),
}).strict();

export const customAppSDKSearchQuerySchema = z.object({
  query: z.string().min(1),
  collections: stringArraySchema,
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).max(10_000).optional(),
  cursor: z.string().min(1).optional(),
  facets: stringArraySchema,
}).strict();

export const customAppSDKSearchResultsSchema = z.object({
  query: z.string().min(1),
  collections: z.array(z.string().min(1)),
  items: z.array(customAppSDKBridgeRecordSchema),
  limit: z.number().int().min(1).max(100),
  offset: z.number().int().min(0),
  nextCursor: z.string().nullable(),
  facets: z.record(z.array(customAppSDKFacetBucketSchema)),
  source: z.literal("search.query"),
}).strict();

export const customAppSDKResourcesListSchema = z.object({
  status: resourceStatusSchema.nullish(),
  kind: resourceKindSchema.nullish(),
}).strict();

export const customAppSDKResourcesListResultSchema = z.object({
  items: z.array(resourceRecordSchema),
  source: z.literal("resources.list"),
}).strict();

export const customAppSDKResourcesReadSchema = z.object({
  id: z.string().regex(/^res_[a-z0-9]+$/),
  maxBytes: z.number().int().min(1).max(256_000).optional(),
}).strict();

export const customAppSDKResourcesPayloadSchema = z.object({
  resource: resourceRecordSchema,
  content: z.string().optional(),
  truncated: z.boolean(),
  error: z.string().optional(),
  redactionPolicy: z.literal(CUSTOM_APP_REDACTION_POLICY_ID),
  source: z.literal("resources.read"),
}).strict();

export const customAppSDKRequestPartialSchema = z.object({
  source: z.enum(["search.query", "db.query", "resources.list", "resources.read"]),
  collection: z.string().min(1).optional(),
  items: z.array(z.union([customAppSDKBridgeRecordSchema, resourceRecordSchema])).optional(),
  resource: resourceRecordSchema.optional(),
  content: z.string().optional(),
  truncated: z.boolean().optional(),
  error: z.string().optional(),
  partialCount: z.number().int().min(0).optional(),
  progress: z.number().min(0).max(1).optional(),
  redactionPolicy: z.literal(CUSTOM_APP_REDACTION_POLICY_ID).optional(),
}).strict();

export const customAppSDKSchemaRegistry = {
  [CUSTOM_APP_SDK_SCHEMA_REFS.searchQuery]: customAppSDKSearchQuerySchema,
  [CUSTOM_APP_SDK_SCHEMA_REFS.searchResults]: customAppSDKSearchResultsSchema,
  [CUSTOM_APP_SDK_SCHEMA_REFS.dbQuery]: customAppSDKDBQuerySchema,
  [CUSTOM_APP_SDK_SCHEMA_REFS.dbRecords]: customAppSDKDBRecordsSchema,
  [CUSTOM_APP_SDK_SCHEMA_REFS.resourcesList]: customAppSDKResourcesListSchema,
  [CUSTOM_APP_SDK_SCHEMA_REFS.resourcesListResult]: customAppSDKResourcesListResultSchema,
  [CUSTOM_APP_SDK_SCHEMA_REFS.resourcesRead]: customAppSDKResourcesReadSchema,
  [CUSTOM_APP_SDK_SCHEMA_REFS.resourcesPayload]: customAppSDKResourcesPayloadSchema,
  [CUSTOM_APP_SDK_SCHEMA_REFS.requestCancel]: customAppSDKRequestCancelSchema,
  [CUSTOM_APP_SDK_SCHEMA_REFS.requestProgress]: customAppSDKRequestProgressSchema,
  [CUSTOM_APP_SDK_SCHEMA_REFS.requestPartial]: customAppSDKRequestPartialSchema,
} satisfies Record<CustomAppSDKSchemaRef, z.ZodTypeAny>;

export function listCustomAppSDKSchemaRefs(): CustomAppSDKSchemaRef[] {
  return Object.keys(customAppSDKSchemaRegistry).sort() as CustomAppSDKSchemaRef[];
}

export function getCustomAppSDKSchema(ref: string): z.ZodTypeAny | undefined {
  return customAppSDKSchemaRegistry[ref as CustomAppSDKSchemaRef];
}
