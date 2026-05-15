import assert from "node:assert/strict";

import { test } from "vitest";

import {
  reportDestinationSchema,
  reportGovernanceStateSchema,
  reportKindSchema,
  reportRecordSchema,
  reportSubmissionReceiptSchema,
  reportValidationPlanSchema,
} from "./schemas-report.ts";

const baseReport = {
  schemaVersion: 1,
  id: "rep_test",
  kind: "bug",
  status: "draft",
  destination: "github_issue",
  repository: "clawjs",
  title: "CLI report bug",
  summary: "The report command fails with enough evidence.",
  reproductionSteps: ["run claw report bug"],
  evidence: [{ kind: "reproduction", label: "step", value: "run claw report bug", redacted: false }],
  attachments: [{ id: "att_1", name: "trace.txt", kind: "log", optIn: true }],
  labels: ["source:agent", "type:bug", "route:issue"],
  fingerprint: "fingerprint_test",
  quality: { ok: true, score: 80, missing: [], blockers: [], signals: ["reproduction"] },
  privacy: { ok: true, redactedCount: 0, blockedPublic: false, blockedReasons: [], attachmentOptInRequired: false },
  duplicateCandidates: [],
  canonicalCandidates: [{
    source: "github_issue",
    id: "123",
    number: 123,
    title: "CLI report bug",
    url: "https://github.com/clawic/clawjs/issues/123",
    similarity: 1,
    strength: "strong",
  }],
  globalDedupe: {
    status: "checked",
    checkedAt: "2026-05-15T00:00:00.000Z",
    connector: "claw-github",
    query: "repo:clawic/clawjs cli report bug",
    candidates: [],
    recommendedAction: "create_new_thread",
    externalPending: [],
  },
  budgetState: {
    status: "ok",
    agentId: "agent_test",
    repository: "clawjs",
    limits: { draftsPerDay: 20, publishPromptsPerHour: 5, dryRunSubmitsPerHour: 3, duplicateCooldownHours: 24 },
    usage: { draftsToday: 1, publishPromptsThisHour: 0, dryRunSubmitsThisHour: 0 },
    cooldownActive: false,
    blockers: [],
  },
  retention: { policy: "manual_prune", exportRedactedByDefault: true, deleteRequiresConfirmation: true },
  prProposal: {
    problem: "The report command fails with enough evidence.",
    suspectedFiles: ["packages/clawjs/src/cli-report-command.ts"],
    patchPlan: ["Patch the report command."],
    tests: ["Run report tests."],
    risks: ["Wrong file."],
    opensPullRequest: false,
  },
  approvals: [{ id: "approval_cli", surface: "cli_preview", status: "approved", actor: "user", approvedAt: "2026-05-15T00:00:00.000Z" }],
  receipts: [],
  validationPlan: { safeChecks: ["redaction_review"], externalPending: [], prohibitedChecks: ["public_security_disclosure"] },
  createdByAgentId: "agent_test",
  createdAt: "2026-05-15T00:00:00.000Z",
  updatedAt: "2026-05-15T00:00:00.000Z",
  notes: [],
};

test("report schemas accept the governed report contract", () => {
  assert.equal(reportKindSchema.parse("translation"), "translation");
  assert.equal(reportDestinationSchema.parse("github_discussion_feedback"), "github_discussion_feedback");

  const report = reportRecordSchema.parse(baseReport);
  assert.equal(report.id, "rep_test");
  assert.equal(report.repository, "clawjs");
  assert.equal(report.quality.ok, true);

  const state = reportGovernanceStateSchema.parse({
    schemaVersion: 1,
    fingerprintSalt: "0123456789abcdef",
    createdAt: "2026-05-15T00:00:00.000Z",
    updatedAt: "2026-05-15T00:00:00.000Z",
    reports: [baseReport],
    budgetEvents: [],
    budgetOverrides: [],
  });
  assert.equal(state.reports.length, 1);
});

test("report schemas reject unsupported types and invalid quality metadata", () => {
  assert.equal(reportKindSchema.safeParse("general_feedback").success, false);
  assert.equal(reportDestinationSchema.safeParse("public_security_issue").success, false);

  const invalidScore = reportRecordSchema.safeParse({
    ...baseReport,
    quality: { ...baseReport.quality, score: 101 },
  });
  assert.equal(invalidScore.success, false);

  const invalidSalt = reportGovernanceStateSchema.safeParse({
    schemaVersion: 1,
    fingerprintSalt: "short",
    createdAt: "2026-05-15T00:00:00.000Z",
    updatedAt: "2026-05-15T00:00:00.000Z",
    reports: [],
  });
  assert.equal(invalidSalt.success, false);
});

test("report schemas model approval receipts and external validation pending state", () => {
  const receipt = reportSubmissionReceiptSchema.parse({
    id: "receipt_1",
    connector: "claw-github",
    connectorOperationId: "github.action.create-discussion",
    status: "external_pending",
    createdAt: "2026-05-15T00:00:00.000Z",
  });
  assert.equal(receipt.status, "external_pending");

  const validation = reportValidationPlanSchema.parse({
    safeChecks: ["connector_request_plan_dry_run"],
    externalPending: ["github_discussion_repository_and_category_node_ids"],
    prohibitedChecks: ["production_data_mutation"],
  });
  assert.equal(validation.externalPending.includes("github_discussion_repository_and_category_node_ids"), true);
});
