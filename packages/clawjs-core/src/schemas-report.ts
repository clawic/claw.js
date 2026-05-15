import { z } from "zod";

export const reportKindSchema = z.enum([
  "bug",
  "crash",
  "regression",
  "feature",
  "translation",
  "docs",
  "performance",
  "ux_feedback",
  "security",
]);

export const reportDestinationSchema = z.enum([
  "github_issue",
  "github_discussion_ideas",
  "github_discussion_feedback",
  "private_security_advisory",
  "local_draft",
  "canonical_comment",
  "pr_proposal",
]);

export const reportStatusSchema = z.enum([
  "draft",
  "blocked",
  "ready_for_review",
  "approved",
  "submitted",
  "external_pending",
]);

export const reportEvidenceKindSchema = z.enum([
  "log",
  "screenshot",
  "trace",
  "test",
  "reproduction",
  "version",
  "environment",
  "link",
  "note",
]);

export const reportEvidenceSchema = z.object({
  kind: reportEvidenceKindSchema,
  label: z.string().min(1),
  value: z.string().min(1),
  redacted: z.boolean().default(false),
});

export const reportAttachmentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: z.string().min(1).default("file"),
  optIn: z.boolean(),
});

export const reportQualityGateSchema = z.object({
  ok: z.boolean(),
  score: z.number().min(0).max(100),
  missing: z.array(z.string()),
  blockers: z.array(z.string()),
  signals: z.array(z.string()),
});

export const reportPrivacyReviewSchema = z.object({
  ok: z.boolean(),
  redactedCount: z.number().int().min(0),
  blockedPublic: z.boolean(),
  blockedReasons: z.array(z.string()),
  attachmentOptInRequired: z.boolean(),
});

export const reportDedupeCandidateSchema = z.object({
  reportId: z.string().min(1),
  fingerprint: z.string().min(1),
  title: z.string().min(1),
  status: reportStatusSchema,
  destination: reportDestinationSchema,
  similarity: z.number().min(0).max(1),
});

export const reportApprovalSchema = z.object({
  id: z.string().min(1),
  surface: z.enum(["cli_preview", "signed_host"]),
  status: z.enum(["required", "approved", "external_pending"]),
  actor: z.string().min(1),
  approvedAt: z.string().min(1).optional(),
  hostApprovalId: z.string().min(1).optional(),
  reason: z.string().min(1).optional(),
});

export const reportSubmissionReceiptSchema = z.object({
  id: z.string().min(1),
  connector: z.literal("claw-github"),
  connectorOperationId: z.string().min(1),
  status: z.enum(["dry_run", "external_pending", "submitted"]),
  createdAt: z.string().min(1),
  externalUrl: z.string().min(1).optional(),
});

export const reportValidationPlanSchema = z.object({
  safeChecks: z.array(z.string()),
  externalPending: z.array(z.string()),
  prohibitedChecks: z.array(z.string()),
});

export const reportRecordSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  kind: reportKindSchema,
  status: reportStatusSchema,
  destination: reportDestinationSchema,
  repository: z.enum(["clawjs", "clawix"]).default("clawjs"),
  title: z.string().min(1),
  summary: z.string().min(1),
  component: z.string().min(1).optional(),
  locale: z.string().min(1).optional(),
  observed: z.string().min(1).optional(),
  expected: z.string().min(1).optional(),
  impact: z.string().min(1).optional(),
  frequency: z.string().min(1).optional(),
  version: z.string().min(1).optional(),
  commit: z.string().min(1).optional(),
  platform: z.string().min(1).optional(),
  installMethod: z.string().min(1).optional(),
  hostMode: z.string().min(1).optional(),
  confidence: z.string().min(1).optional(),
  reproductionSteps: z.array(z.string()),
  evidence: z.array(reportEvidenceSchema),
  attachments: z.array(reportAttachmentSchema),
  labels: z.array(z.string()),
  fingerprint: z.string().min(1),
  quality: reportQualityGateSchema,
  privacy: reportPrivacyReviewSchema,
  duplicateCandidates: z.array(reportDedupeCandidateSchema),
  approvals: z.array(reportApprovalSchema),
  receipts: z.array(reportSubmissionReceiptSchema),
  validationPlan: reportValidationPlanSchema.optional(),
  createdByAgentId: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  submittedAt: z.string().min(1).optional(),
  externalUrl: z.string().min(1).optional(),
  notes: z.array(z.string()),
});

export const reportGovernanceStateSchema = z.object({
  schemaVersion: z.literal(1),
  fingerprintSalt: z.string().min(16),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  reports: z.array(reportRecordSchema),
});

export type ReportKind = z.infer<typeof reportKindSchema>;
export type ReportDestination = z.infer<typeof reportDestinationSchema>;
export type ReportStatus = z.infer<typeof reportStatusSchema>;
export type ReportRecord = z.infer<typeof reportRecordSchema>;
export type ReportGovernanceState = z.infer<typeof reportGovernanceStateSchema>;
