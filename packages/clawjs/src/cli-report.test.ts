import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { test } from "vitest";

import { CLI_EXIT_FAILURE, CLI_EXIT_OK } from "./index.ts";
import { runCliCapture } from "./index-test-utils.ts";

function tempWorkspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-report-"));
}

function parsePayload<T>(stdout: string): { ok: boolean; data: T; error?: { code: string }; meta: { canonicalCommand: string; action?: string } } {
  return JSON.parse(stdout);
}

test("report bug creates a sanitized local draft with quality metadata", async () => {
  const workspace = tempWorkspace();
  const result = await runCliCapture([
    "report",
    "bug",
    "CLI leaks local path",
    "--workspace",
    workspace,
    "--observed",
    "Saw /Users/alice/project and ghp_123456789012345678901234567890123456",
    "--expected",
    "No private path or token",
    "--repro",
    "run command; inspect output",
    "--json",
  ], workspace);

  assert.equal(result.code, CLI_EXIT_OK);
  const payload = parsePayload<{ report: { id: string; observed: string; quality: { ok: boolean }; privacy: { redactedCount: number }; labels: string[] } }>(result.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.meta.canonicalCommand, "report");
  assert.equal(payload.data.report.quality.ok, true);
  assert.equal(payload.data.report.observed.includes("/Users/alice"), false);
  assert.equal(payload.data.report.observed.includes("ghp_"), false);
  assert.equal(payload.data.report.privacy.redactedCount >= 2, true);
  assert.equal(payload.data.report.labels.includes("privacy:redacted"), true);
});

test("report blocks low evidence submission with NOT_ENOUGH_INFO", async () => {
  const workspace = tempWorkspace();
  const draft = await runCliCapture(["report", "bug", "Vague failure", "--workspace", workspace, "--json"], workspace);
  const created = parsePayload<{ report: { id: string; quality: { ok: boolean; blockers: string[] } } }>(draft.stdout);
  assert.equal(created.data.report.quality.ok, false);
  assert.equal(created.data.report.quality.blockers.includes("NOT_ENOUGH_INFO"), true);

  const submit = await runCliCapture(["report", "submit", created.data.report.id, "--workspace", workspace, "--confirm", "--json"], workspace);
  assert.equal(submit.code, CLI_EXIT_FAILURE);
  const failed = JSON.parse(submit.stdout) as { ok: boolean; error: { code: string; message: string } };
  assert.equal(failed.ok, false);
  assert.equal(failed.error.code, "not_enough_info");
  assert.equal(failed.error.message.includes("NOT_ENOUGH_INFO"), true);
});

test("report routes features, feedback, translations, and security to the approved destinations", async () => {
  const workspace = tempWorkspace();
  const feature = await runCliCapture(["report", "feature", "Add saved report views", "--workspace", workspace, "--impact", "Teams can triage faster", "--json"], workspace);
  const featurePayload = parsePayload<{ report: { destination: string; labels: string[] } }>(feature.stdout);
  assert.equal(featurePayload.data.report.destination, "github_discussion_ideas");
  assert.equal(featurePayload.data.report.labels.includes("route:discussion-ideas"), true);

  const feedback = await runCliCapture(["report", "draft", "Settings sidebar feels confusing", "--workspace", workspace, "--kind", "ux_feedback", "--observed", "Icons are unclear", "--json"], workspace);
  const feedbackPayload = parsePayload<{ report: { destination: string } }>(feedback.stdout);
  assert.equal(feedbackPayload.data.report.destination, "github_discussion_feedback");

  const translation = await runCliCapture(["report", "translation", "Spanish settings copy", "--workspace", workspace, "--locale", "es", "--observed", "Ajustes malo", "--expected", "Ajustes", "--json"], workspace);
  const translationPayload = parsePayload<{ report: { destination: string } }>(translation.stdout);
  assert.equal(translationPayload.data.report.destination, "github_issue");

  const security = await runCliCapture(["report", "security", "Token exposure", "--workspace", workspace, "--observed", "token in logs", "--impact", "Credentials could leak", "--json"], workspace);
  const securityPayload = parsePayload<{ report: { destination: string; labels: string[] } }>(security.stdout);
  assert.equal(securityPayload.data.report.destination, "private_security_advisory");
  assert.equal(securityPayload.data.report.labels.includes("privacy:private-security"), true);
});

test("report dedupe recommends commenting on the canonical draft", async () => {
  const workspace = tempWorkspace();
  const args = [
    "report",
    "bug",
    "CLI crashes when reports are listed",
    "--workspace",
    workspace,
    "--observed",
    "Process exits",
    "--expected",
    "Reports are listed",
    "--repro",
    "run claw report status",
    "--component",
    "cli",
    "--json",
  ];
  await runCliCapture(args, workspace);
  const second = await runCliCapture(args, workspace);
  const secondPayload = parsePayload<{ report: { id: string; duplicateCandidates: unknown[] } }>(second.stdout);
  assert.equal(secondPayload.data.report.duplicateCandidates.length > 0, true);

  const dedupe = await runCliCapture(["report", "dedupe", secondPayload.data.report.id, "--workspace", workspace, "--json"], workspace);
  const dedupePayload = parsePayload<{ canonicalAction: string; candidates: unknown[] }>(dedupe.stdout);
  assert.equal(dedupePayload.data.canonicalAction, "comment_on_canonical");
  assert.equal(dedupePayload.data.candidates.length > 0, true);
});

test("report preview omits non opted-in attachment paths", async () => {
  const workspace = tempWorkspace();
  const draft = await runCliCapture([
    "report",
    "bug",
    "Screenshot issue",
    "--workspace",
    workspace,
    "--observed",
    "Bad panel",
    "--expected",
    "Good panel",
    "--repro",
    "open settings",
    "--attachment",
    "/Users/alice/Desktop/private.png",
    "--json",
  ], workspace);
  const created = parsePayload<{ report: { id: string; privacy: { attachmentOptInRequired: boolean } } }>(draft.stdout);
  assert.equal(created.data.report.privacy.attachmentOptInRequired, true);

  const preview = await runCliCapture(["report", "preview", created.data.report.id, "--workspace", workspace, "--json"], workspace);
  const payload = parsePayload<{ markdown: string }>(preview.stdout);
  assert.equal(payload.data.markdown.includes("/Users/alice"), false);
  assert.equal(payload.data.markdown.includes("private.png"), false);
});

test("report templates expose the closed taxonomy and Discussion categories", async () => {
  const workspace = tempWorkspace();
  const result = await runCliCapture(["report", "templates", "--workspace", workspace, "--json"], workspace);
  const payload = parsePayload<{ discussionCategories: string[]; labels: { routing: string[] } }>(result.stdout);
  assert.deepEqual(payload.data.discussionCategories, ["Ideas", "Feedback"]);
  assert.equal(payload.data.labels.routing.includes("route:security-advisory"), true);
});

test("report submit dry-run plans Claw GitHub connector operations", async () => {
  const workspace = tempWorkspace();
  const draft = await runCliCapture([
    "report",
    "bug",
    "Issue creation plan",
    "--workspace",
    workspace,
    "--observed",
    "The report command fails",
    "--expected",
    "The report command succeeds",
    "--repro",
    "run claw report bug",
    "--json",
  ], workspace);
  const created = parsePayload<{ report: { id: string } }>(draft.stdout);

  const submit = await runCliCapture(["report", "submit", created.data.report.id, "--workspace", workspace, "--confirm", "--dry-run", "--json"], workspace);
  assert.equal(submit.code, CLI_EXIT_OK);
  const payload = parsePayload<{ submissionPlan: { connector: string; connectorPackage: string; connectorOperationId: string; values: { title: string } } }>(submit.stdout);
  assert.equal(payload.data.submissionPlan.connector, "claw-github");
  assert.equal(payload.data.submissionPlan.connectorPackage, "@clawjs/integrations");
  assert.equal(payload.data.submissionPlan.connectorOperationId, "github.action.create-issue");
  assert.equal(payload.data.submissionPlan.values.title, "Issue creation plan");
});

test("report submit dry-run maps Discussions, private security, duplicates, and PR proposals safely", async () => {
  const workspace = tempWorkspace();
  const feature = await runCliCapture(["report", "feature", "Vote on saved views", "--workspace", workspace, "--impact", "Teams can vote on demand", "--json"], workspace);
  const featureCreated = parsePayload<{ report: { id: string } }>(feature.stdout);
  const featureSubmit = await runCliCapture(["report", "submit", featureCreated.data.report.id, "--workspace", workspace, "--confirm", "--dry-run", "--json"], workspace);
  const featurePayload = parsePayload<{ submissionPlan: { connectorOperationId: string; values: { category: string; repositoryId: string; categoryId: string } } }>(featureSubmit.stdout);
  assert.equal(featurePayload.data.submissionPlan.connectorOperationId, "github.action.create-discussion");
  assert.equal(featurePayload.data.submissionPlan.values.category, "Ideas");
  assert.equal(featurePayload.data.submissionPlan.values.repositoryId, "<github-repository-node-id-required>");
  assert.equal(featurePayload.data.submissionPlan.values.categoryId, "<github-discussion-category-node-id-required>");

  const security = await runCliCapture(["report", "security", "Token exposure", "--workspace", workspace, "--observed", "token appears", "--impact", "critical credential exposure", "--json"], workspace);
  const securityCreated = parsePayload<{ report: { id: string } }>(security.stdout);
  const securitySubmit = await runCliCapture(["report", "submit", securityCreated.data.report.id, "--workspace", workspace, "--confirm", "--dry-run", "--json"], workspace);
  const securityPayload = parsePayload<{ submissionPlan: { connectorOperationId: string; values: { summary: string; severity: string } } }>(securitySubmit.stdout);
  assert.equal(securityPayload.data.submissionPlan.connectorOperationId, "github.action.create-security-advisory-report");
  assert.equal(securityPayload.data.submissionPlan.values.summary, "Token exposure");
  assert.equal(securityPayload.data.submissionPlan.values.severity, "critical");

  const duplicateArgs = ["report", "bug", "Duplicate crash", "--workspace", workspace, "--observed", "crash", "--expected", "no crash", "--repro", "run command", "--json"];
  await runCliCapture(duplicateArgs, workspace);
  const duplicate = await runCliCapture(duplicateArgs, workspace);
  const duplicateCreated = parsePayload<{ report: { id: string } }>(duplicate.stdout);
  const duplicateSubmit = await runCliCapture(["report", "submit", duplicateCreated.data.report.id, "--workspace", workspace, "--confirm", "--dry-run", "--json"], workspace);
  const duplicatePayload = parsePayload<{ submissionPlan: { action: string; connectorOperationId: string; values: { issueNumber: string } } }>(duplicateSubmit.stdout);
  assert.equal(duplicatePayload.data.submissionPlan.action, "comment_on_canonical");
  assert.equal(duplicatePayload.data.submissionPlan.connectorOperationId, "github.action.create-issue-comment");
  assert.equal(duplicatePayload.data.submissionPlan.values.issueNumber, "<canonical-issue-number-required>");

  const proposal = await runCliCapture(["report", "draft", "Fix obvious typo", "--workspace", workspace, "--kind", "docs", "--destination", "pr_proposal", "--observed", "typo", "--expected", "fixed typo", "--repro", "read docs", "--json"], workspace);
  const proposalCreated = parsePayload<{ report: { id: string } }>(proposal.stdout);
  const proposalSubmit = await runCliCapture(["report", "submit", proposalCreated.data.report.id, "--workspace", workspace, "--confirm", "--dry-run", "--json"], workspace);
  const proposalPayload = parsePayload<{ submissionPlan: { action: string; connectorOperationId: string } }>(proposalSubmit.stdout);
  assert.equal(proposalPayload.data.submissionPlan.action, "propose_pull_request_only");
  assert.equal(proposalPayload.data.submissionPlan.connectorOperationId, "proposal_only.no_github_mutation");
});
