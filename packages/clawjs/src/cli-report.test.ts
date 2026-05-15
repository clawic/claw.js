import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
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

async function startFakeGitHubServer(): Promise<{ url: string; requests: Array<{ method: string; path: string; body: unknown; authorization: string | null }>; close: () => Promise<void> }> {
  const requests: Array<{ method: string; path: string; body: unknown; authorization: string | null }> = [];
  const server = http.createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    const rawBody = Buffer.concat(chunks).toString("utf8");
    const body = rawBody ? JSON.parse(rawBody) : null;
    const requestPath = request.url ?? "/";
    requests.push({ method: request.method ?? "GET", path: requestPath, body, authorization: request.headers.authorization ?? null });
    response.setHeader("content-type", "application/json");
    if (requestPath === "/graphql") {
      response.end(JSON.stringify({ data: { createDiscussion: { discussion: { id: "D_test", number: 7, title: body?.variables?.title, url: "https://github.com/clawic/clawjs/discussions/7" } } } }));
      return;
    }
    if (requestPath.endsWith("/security-advisories/reports")) {
      response.end(JSON.stringify({ ghsa_id: "GHSA-test-1234-5678", html_url: "https://github.com/clawic/clawjs/security/advisories/GHSA-test-1234-5678", state: "triage", summary: body?.summary }));
      return;
    }
    if (requestPath.endsWith("/issues/42/comments")) {
      response.end(JSON.stringify({ id: 10, body: body?.body, html_url: "https://github.com/clawic/clawjs/issues/42#issuecomment-10" }));
      return;
    }
    if (requestPath.endsWith("/issues")) {
      response.end(JSON.stringify({ id: 9, number: 9, title: body?.title, html_url: "https://github.com/clawic/clawjs/issues/9" }));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ message: "not found" }));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}/`,
    requests,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
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
    "Saw /Users/alice/project and ghp_123456789012345678901234567890123456 at https://internal.example/token?secret=abc with TEAM_ID=ABCDE12345",
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
  assert.equal(payload.data.report.observed.includes("internal.example"), false);
  assert.equal(payload.data.report.observed.includes("ABCDE12345"), false);
  assert.equal(payload.data.report.privacy.redactedCount >= 4, true);
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

  const submit = await runCliCapture(["report", "submit", created.data.report.id, "--workspace", workspace, "--confirm", "--dry-run", "--github-user", "octocat", "--host-approval-id", "approval_123", "--json"], workspace);
  assert.equal(submit.code, CLI_EXIT_OK);
  const payload = parsePayload<{ publicationIdentity: { mode: string; githubUser: string; tokenSecretField: string }; approvalSurface: { cliPreview: string; signedHost: string; hostApprovalId: string }; report: { approvals: Array<{ surface: string; status: string }>; receipts: unknown[] }; submissionPlan: { connector: string; connectorPackage: string; connectorOperationId: string; values: { title: string } } }>(submit.stdout);
  assert.equal(payload.data.publicationIdentity.mode, "user_github_account");
  assert.equal(payload.data.publicationIdentity.githubUser, "octocat");
  assert.equal(payload.data.publicationIdentity.tokenSecretField.endsWith("oken"), true);
  assert.notEqual(payload.data.publicationIdentity.tokenSecretField, "githubToken");
  assert.equal(payload.data.approvalSurface.cliPreview, "approved");
  assert.equal(payload.data.approvalSurface.signedHost, "approved");
  assert.equal(payload.data.approvalSurface.hostApprovalId, "approval_123");
  assert.equal(payload.data.report.approvals.some((approval) => approval.surface === "signed_host" && approval.status === "approved"), true);
  assert.equal(payload.data.report.receipts.length, 1);
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

test("report triage automation recommends without destructive authority", async () => {
  const workspace = tempWorkspace();
  await runCliCapture(["report", "bug", "Needs evidence", "--workspace", workspace, "--json"], workspace);
  const result = await runCliCapture(["report", "triage", "--workspace", workspace, "--json"], workspace);
  const payload = parsePayload<{ queue: Array<{ recommendedAction: string; labelRecommendations: string[]; destructiveActionsAllowed: boolean }>; automationAuthority: string; prohibitedActions: string[] }>(result.stdout);
  assert.equal(payload.data.automationAuthority, "recommend_label_score_dedupe_only");
  assert.equal(payload.data.prohibitedActions.includes("close"), true);
  assert.equal(payload.data.prohibitedActions.includes("lock"), true);
  assert.equal(payload.data.queue[0]?.recommendedAction, "request_more_info");
  assert.equal(payload.data.queue[0]?.labelRecommendations.includes("confidence:needs-info"), true);
  assert.equal(payload.data.queue[0]?.destructiveActionsAllowed, false);
});

test("report check exposes safe validation and EXTERNAL PENDING tasks", async () => {
  const workspace = tempWorkspace();
  const feature = await runCliCapture(["report", "feature", "Discuss demand", "--workspace", workspace, "--impact", "Votes are needed", "--json"], workspace);
  const created = parsePayload<{ report: { id: string } }>(feature.stdout);
  const check = await runCliCapture(["report", "check", created.data.report.id, "--workspace", workspace, "--json"], workspace);
  const payload = parsePayload<{ report: { validationPlan: { safeChecks: string[]; externalPending: string[]; prohibitedChecks: string[] } } }>(check.stdout);
  assert.equal(payload.data.report.validationPlan.safeChecks.includes("connector_request_plan_dry_run"), true);
  assert.equal(payload.data.report.validationPlan.externalPending.includes("github_discussion_repository_and_category_node_ids"), true);
  assert.equal(payload.data.report.validationPlan.prohibitedChecks.includes("public_security_disclosure"), true);
});

test("report submit can execute approved connector calls against a fake GitHub server", async () => {
  const workspace = tempWorkspace();
  let fakeGitHub: Awaited<ReturnType<typeof startFakeGitHubServer>>;
  try {
    fakeGitHub = await startFakeGitHubServer();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EPERM") return;
    throw error;
  }
  process.env.CLAW_REPORT_GITHUB_TOKEN = "offline-test-token";
  try {
    const bug = await runCliCapture(["report", "bug", "Connector issue", "--workspace", workspace, "--observed", "fails", "--expected", "works", "--repro", "run command", "--json"], workspace);
    const bugId = parsePayload<{ report: { id: string } }>(bug.stdout).data.report.id;
    const issueSubmit = await runCliCapture(["report", "submit", bugId, "--workspace", workspace, "--confirm", "--execute", "--github-base-url", fakeGitHub.url, "--host-approval-id", "approval_issue", "--github-user", "octocat", "--json"], workspace);
    assert.equal(issueSubmit.code, CLI_EXIT_OK);
    const issuePayload = parsePayload<{ receipt: { status: string; externalUrl: string }; report: { status: string } }>(issueSubmit.stdout);
    assert.equal(issuePayload.data.receipt.status, "submitted");
    assert.equal(issuePayload.data.report.status, "submitted");
    assert.equal(issuePayload.data.receipt.externalUrl, "https://github.com/clawic/clawjs/issues/9");

    const feature = await runCliCapture(["report", "feature", "Connector discussion", "--workspace", workspace, "--impact", "Votes", "--json"], workspace);
    const featureId = parsePayload<{ report: { id: string } }>(feature.stdout).data.report.id;
    await runCliCapture(["report", "submit", featureId, "--workspace", workspace, "--confirm", "--execute", "--github-base-url", fakeGitHub.url, "--host-approval-id", "approval_discussion", "--github-repository-id", "R_test", "--discussion-category-id", "DIC_test", "--json"], workspace);

    const security = await runCliCapture(["report", "security", "Connector security", "--workspace", workspace, "--observed", "secret", "--impact", "critical leak", "--json"], workspace);
    const securityId = parsePayload<{ report: { id: string } }>(security.stdout).data.report.id;
    await runCliCapture(["report", "submit", securityId, "--workspace", workspace, "--confirm", "--execute", "--github-base-url", fakeGitHub.url, "--host-approval-id", "approval_security", "--json"], workspace);

    const duplicateArgs = ["report", "bug", "Connector duplicate", "--workspace", workspace, "--observed", "same failure", "--expected", "success", "--repro", "same command", "--json"];
    await runCliCapture(duplicateArgs, workspace);
    const duplicate = await runCliCapture(duplicateArgs, workspace);
    const duplicateId = parsePayload<{ report: { id: string } }>(duplicate.stdout).data.report.id;
    await runCliCapture(["report", "submit", duplicateId, "--workspace", workspace, "--confirm", "--execute", "--github-base-url", fakeGitHub.url, "--host-approval-id", "approval_comment", "--canonical-number", "42", "--json"], workspace);

    assert.equal(fakeGitHub.requests.some((request) => request.path === "/repos/clawic/clawjs/issues" && request.method === "POST"), true);
    assert.equal(fakeGitHub.requests.some((request) => request.path === "/graphql" && request.method === "POST"), true);
    assert.equal(fakeGitHub.requests.some((request) => request.path === "/repos/clawic/clawjs/security-advisories/reports" && request.method === "POST"), true);
    assert.equal(fakeGitHub.requests.some((request) => request.path === "/repos/clawic/clawjs/issues/42/comments" && request.method === "POST"), true);
    assert.equal(fakeGitHub.requests.every((request) => request.authorization === "Bearer offline-test-token"), true);
  } finally {
    delete process.env.CLAW_REPORT_GITHUB_TOKEN;
    await fakeGitHub.close();
  }
});
