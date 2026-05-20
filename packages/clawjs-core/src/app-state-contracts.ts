import { z } from "zod";

export const clawAppStateOperationKindSchema = z.enum([
  "state.set",
  "project.upsert",
  "project.delete",
  "project.order",
  "pin.upsert",
  "pin.delete",
  "pin.order",
  "title.upsert",
  "title.delete",
  "archive.set",
  "archive.delete",
  "sidebar.upsert",
  "sidebar.delete",
  "sidebar.replace",
  "terminal.upsert",
  "terminal.delete",
]);

const metadataSchema = z.record(z.unknown()).default({});

export const clawAppStateOperationSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("state.set"),
    key: z.string().min(1),
    value: z.unknown(),
  }),
  z.object({
    kind: z.literal("project.upsert"),
    id: z.string().min(1),
    resourceId: z.string().min(1).nullable().optional(),
    name: z.string().min(1),
    path: z.string().default(""),
    sortOrder: z.number().int().nullable().optional(),
    hidden: z.boolean().default(false),
    metadata: metadataSchema,
  }),
  z.object({
    kind: z.literal("project.delete"),
    id: z.string().min(1),
  }),
  z.object({
    kind: z.literal("project.order"),
    ids: z.array(z.string().min(1)),
  }),
  z.object({
    kind: z.literal("pin.upsert"),
    threadId: z.string().min(1),
    sortOrder: z.number().int(),
    pinnedAt: z.string().min(1).optional(),
  }),
  z.object({
    kind: z.literal("pin.delete"),
    threadId: z.string().min(1),
  }),
  z.object({
    kind: z.literal("pin.order"),
    threadIds: z.array(z.string().min(1)),
  }),
  z.object({
    kind: z.literal("title.upsert"),
    threadId: z.string().min(1),
    title: z.string().min(1),
    source: z.string().min(1).default("manual"),
    updatedAt: z.string().min(1).optional(),
  }),
  z.object({
    kind: z.literal("title.delete"),
    threadId: z.string().min(1),
  }),
  z.object({
    kind: z.literal("archive.set"),
    threadId: z.string().min(1),
    archivedAt: z.string().min(1).optional(),
  }),
  z.object({
    kind: z.literal("archive.delete"),
    threadId: z.string().min(1),
  }),
  z.object({
    kind: z.literal("sidebar.upsert"),
    threadId: z.string().min(1),
    chatUuid: z.string().default(""),
    title: z.string().min(1),
    cwd: z.string().nullable().optional(),
    projectId: z.string().nullable().optional(),
    projectPath: z.string().nullable().optional(),
    updatedAt: z.string().min(1).optional(),
    archived: z.boolean().default(false),
    pinned: z.boolean().default(false),
    metadata: metadataSchema,
  }),
  z.object({
    kind: z.literal("sidebar.delete"),
    threadId: z.string().min(1),
  }),
  z.object({
    kind: z.literal("sidebar.replace"),
    items: z.array(z.object({
      threadId: z.string().min(1),
      chatUuid: z.string().default(""),
      title: z.string().min(1),
      cwd: z.string().nullable().optional(),
      projectId: z.string().nullable().optional(),
      projectPath: z.string().nullable().optional(),
      updatedAt: z.string().min(1).optional(),
      archived: z.boolean().default(false),
      pinned: z.boolean().default(false),
      metadata: metadataSchema,
    })),
  }),
  z.object({
    kind: z.literal("terminal.upsert"),
    id: z.string().min(1),
    title: z.string().min(1),
    cwd: z.string().nullable().optional(),
    sortOrder: z.number().int().default(0),
    metadata: metadataSchema,
  }),
  z.object({
    kind: z.literal("terminal.delete"),
    id: z.string().min(1),
  }),
]);

export const clawAppStateTransactionRequestSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  requestId: z.string().min(1),
  hostId: z.string().min(1).default("local"),
  operations: z.array(clawAppStateOperationSchema).min(1),
  clientContext: z.record(z.unknown()).default({}),
  requestedAt: z.string().min(1).optional(),
});

export const clawAppStateSyncReceiptSchema = z.object({
  schemaVersion: z.literal(1),
  receiptId: z.string().min(1),
  requestId: z.string().min(1),
  hostId: z.string().min(1),
  status: z.enum(["applied", "failed"]),
  operationCount: z.number().int().nonnegative(),
  appliedAt: z.string().min(1),
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
  }).nullable().default(null),
});

export const clawAppStateProjectionSchema = z.object({
  schemaVersion: z.literal(1),
  projectedAt: z.string().min(1),
  projects: z.array(z.record(z.unknown())),
  pinnedThreads: z.array(z.record(z.unknown())),
  titles: z.array(z.record(z.unknown())),
  archives: z.array(z.record(z.unknown())),
  sidebar: z.array(z.record(z.unknown())),
  terminalTabs: z.array(z.record(z.unknown())),
  receipts: z.array(clawAppStateSyncReceiptSchema).default([]),
});

export type ClawAppStateOperation = z.infer<typeof clawAppStateOperationSchema>;
export type ClawAppStateTransactionRequest = z.infer<typeof clawAppStateTransactionRequestSchema>;
export type ClawAppStateSyncReceipt = z.infer<typeof clawAppStateSyncReceiptSchema>;
export type ClawAppStateProjection = z.infer<typeof clawAppStateProjectionSchema>;
