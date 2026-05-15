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

export const reportCanonicalCandidateSchema = z.object({
  source: z.enum(["github_issue", "github_discussion"]),
  id: z.string().min(1),
  number: z.number().int().min(1).optional(),
  title: z.string().min(1),
  url: z.string().min(1),
  state: z.string().min(1).optional(),
  similarity: z.number().min(0).max(1),
  strength: z.enum(["strong", "medium", "weak"]),
});

export const reportGlobalDedupeSchema = z.object({
  status: z.enum(["not_checked", "checked", "external_pending", "review_required"]),
  checkedAt: z.string().min(1).optional(),
  connector: z.literal("claw-github"),
  query: z.string().min(1),
  candidates: z.array(reportCanonicalCandidateSchema),
  recommendedAction: z.enum(["create_new_thread", "comment_on_canonical", "review_candidates"]),
  externalPending: z.array(z.string()),
});

export const reportBudgetStateSchema = z.object({
  status: z.enum(["ok", "limited", "override_active"]),
  agentId: z.string().min(1),
  repository: z.enum(["clawjs", "clawix"]),
  limits: z.object({
    draftsPerDay: z.number().int().min(1),
    publishPromptsPerHour: z.number().int().min(1),
    dryRunSubmitsPerHour: z.number().int().min(1),
    duplicateCooldownHours: z.number().int().min(1),
  }),
  usage: z.object({
    draftsToday: z.number().int().min(0),
    publishPromptsThisHour: z.number().int().min(0),
    dryRunSubmitsThisHour: z.number().int().min(0),
  }),
  cooldownActive: z.boolean(),
  blockers: z.array(z.string()),
  overrideId: z.string().min(1).optional(),
});

export const reportRetentionSchema = z.object({
  policy: z.literal("manual_prune"),
  exportRedactedByDefault: z.literal(true),
  deleteRequiresConfirmation: z.literal(true),
  lastExportedAt: z.string().min(1).optional(),
  deletedAt: z.string().min(1).optional(),
});

export const reportPrProposalSchema = z.object({
  problem: z.string().min(1),
  suspectedFiles: z.array(z.string()),
  patchPlan: z.array(z.string()),
  tests: z.array(z.string()),
  risks: z.array(z.string()),
  opensPullRequest: z.literal(false),
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
  canonicalCandidates: z.array(reportCanonicalCandidateSchema).optional(),
  globalDedupe: reportGlobalDedupeSchema.optional(),
  budgetState: reportBudgetStateSchema.optional(),
  retention: reportRetentionSchema.optional(),
  prProposal: reportPrProposalSchema.optional(),
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
  budgetEvents: z.array(z.object({
    id: z.string().min(1),
    action: z.enum(["draft", "publish_prompt", "dry_run_submit", "override"]),
    reportId: z.string().min(1).optional(),
    agentId: z.string().min(1),
    repository: z.enum(["clawjs", "clawix"]),
    fingerprint: z.string().min(1).optional(),
    createdAt: z.string().min(1),
    reason: z.string().min(1).optional(),
  })).default([]),
  budgetOverrides: z.array(z.object({
    id: z.string().min(1),
    agentId: z.string().min(1),
    repository: z.enum(["clawjs", "clawix"]),
    createdAt: z.string().min(1),
    reason: z.string().min(1),
  })).default([]),
});

export type ReportKind = z.infer<typeof reportKindSchema>;
export type ReportDestination = z.infer<typeof reportDestinationSchema>;
export type ReportStatus = z.infer<typeof reportStatusSchema>;
export type ReportRecord = z.infer<typeof reportRecordSchema>;
export type ReportGovernanceState = z.infer<typeof reportGovernanceStateSchema>;
