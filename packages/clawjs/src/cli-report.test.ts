import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";

import { test } from "vitest";

import { CLI_EXIT_DEGRADED, CLI_EXIT_FAILURE, CLI_EXIT_OK } from "./index.ts";
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
      if (String(body?.query ?? "").includes("SearchDiscussions")) {
        response.end(JSON.stringify({ data: { search: { discussionCount: 1, nodes: [{ id: "D_search", number: 77, title: "Connector discussion", url: "https://github.com/clawic/clawjs/discussions/77" }] } } }));
        return;
      }
      response.end(JSON.stringify({ data: { createDiscussion: { discussion: { id: "D_test", number: 7, title: body?.variables?.title, url: "https://github.com/clawic/clawjs/discussions/7" } } } }));
      return;
    }
    if (requestPath.startsWith("/search/issues")) {
      const query = (new URL(`http://fake.local${requestPath}`).searchParams.get("q") ?? "").toLowerCase();
      const items = query.includes("canonical issue")
        ? [{ id: 123, number: 123, title: "Canonical issue duplicate", html_url: "https://github.com/clawic/clawjs/issues/123", state: "open" }]
        : query.includes("medium candidate")
          ? [{ id: 124, number: 124, title: "Medium candidate nearby", html_url: "https://github.com/clawic/clawjs/issues/124", state: "open" }]
          : [];
      response.end(JSON.stringify({ total_count: items.length, items }));
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
    if (requestPath.endsWith("/labels")) {
      response.end(JSON.stringify({ id: 11, name: body?.name, color: body?.color }));
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
  const privatePath = ["/Users", "alice", "project"].join("/");
  const privateToken = ["ghp", "123456789012345678901234567890123456"].join("_");
  const privateTeamId = ["TEAM_ID", "TEAM123"].join("=");
  const result = await runCliCapture([
    "report",
    "bug",
    "CLI leaks local path",
    "--workspace",
    workspace,
    "--observed",
    `Saw ${privatePath} and ${privateToken} at https://internal.example/token?secret=abc with ${privateTeamId}`,
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
  assert.equal(payload.data.report.observed.includes(["/Users", "alice"].join("/")), false);
  assert.equal(payload.data.report.observed.includes(["ghp", ""].join("_")), false);
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

  const broadTranslation = await runCliCapture(["report", "translation", "Chinese entire language feels bad", "--workspace", workspace, "--locale", "zh-Hans", "--observed", "The whole language feels wrong", "--expected", "Native review", "--json"], workspace);
  const broadTranslationPayload = parsePayload<{ report: { destination: string } }>(broadTranslation.stdout);
  assert.equal(broadTranslationPayload.data.report.destination, "github_discussion_feedback");

  const security = await runCliCapture(["report", "security", "Token exposure", "--workspace", workspace, "--observed", "token in logs", "--impact", "Credentials could leak", "--json"], workspace);
  const securityPayload = parsePayload<{ report: { destination: string; labels: string[] } }>(security.stdout);
  assert.equal(securityPayload.data.report.destination, "private_security_advisory");
  assert.equal(securityPayload.data.report.labels.includes("privacy:private-security"), true);

  const forcedPublicSecurity = await runCliCapture(["report", "draft", "Forced public security", "--workspace", workspace, "--kind", "security", "--destination", "github_issue", "--impact", "credential exposure", "--json"], workspace);
  const forcedSecurityPayload = parsePayload<{ report: { destination: string } }>(forcedPublicSecurity.stdout);
  assert.equal(forcedSecurityPayload.data.report.destination, "private_security_advisory");
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
  const privateAttachmentPath = ["/Users", "alice", "Desktop", "private.png"].join("/");
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
    privateAttachmentPath,
    "--json",
  ], workspace);
  const created = parsePayload<{ report: { id: string; privacy: { attachmentOptInRequired: boolean } } }>(draft.stdout);
  assert.equal(created.data.report.privacy.attachmentOptInRequired, true);

  const preview = await runCliCapture(["report", "preview", created.data.report.id, "--workspace", workspace, "--json"], workspace);
  const payload = parsePayload<{ markdown: string }>(preview.stdout);
  assert.equal(payload.data.markdown.includes(["/Users", "alice"].join("/")), false);
  assert.equal(payload.data.markdown.includes("private.png"), false);
});

test("report submit blocks private security attachments without explicit opt-in", async () => {
  const workspace = tempWorkspace();
  const privateAttachmentPath = ["/Users", "alice", "Desktop", "security.log"].join("/");
  const draft = await runCliCapture([
    "report",
    "security",
    "Private advisory attachment",
    "--workspace",
    workspace,
    "--observed",
    "secret appears in trace",
    "--impact",
    "critical credential exposure",
    "--attachment",
    privateAttachmentPath,
    "--json",
  ], workspace);
  const created = parsePayload<{ report: { id: string; destination: string; quality: { ok: boolean; blockers: string[] }; privacy: { attachmentOptInRequired: boolean } } }>(draft.stdout);
  assert.equal(created.data.report.destination, "private_security_advisory");
  assert.equal(created.data.report.privacy.attachmentOptInRequired, true);
  assert.equal(created.data.report.quality.ok, false);
  assert.equal(created.data.report.quality.blockers.includes("PRIVACY_BLOCKED"), true);

  const submit = await runCliCapture(["report", "submit", created.data.report.id, "--workspace", workspace, "--confirm", "--dry-run", "--json"], workspace);
  assert.equal(submit.code, CLI_EXIT_FAILURE);
  const failed = JSON.parse(submit.stdout) as { ok: boolean; error: { code: string; message: string } };
  assert.equal(failed.ok, false);
  assert.equal(failed.error.code, "privacy_blocked");
  assert.equal(failed.error.message.includes("attachment_opt_in_required"), true);
});

test("report templates expose the closed taxonomy and Discussion categories", async () => {
  const workspace = tempWorkspace();
  const result = await runCliCapture(["report", "templates", "--workspace", workspace, "--json"], workspace);
  const payload = parsePayload<{ discussionCategories: string[]; labels: { routing: string[] } }>(result.stdout);
  assert.deepEqual(payload.data.discussionCategories, ["Ideas", "Feedback"]);
  assert.equal(payload.data.labels.routing.includes("route:security-advisory"), true);
});

test("report routes ClawJS and Clawix repositories explicitly", async () => {
  const workspace = tempWorkspace();
  const clawix = await runCliCapture([
    "report",
    "bug",
    "Host approval panel fails",
    "--workspace",
    workspace,
    "--repo",
    "clawix",
    "--component",
    "host",
    "--observed",
    "Approval sheet does not open",
    "--expected",
    "Approval sheet opens",
    "--repro",
    "open Clawix approval sheet",
    "--json",
  ], workspace);
  const created = parsePayload<{ report: { id: string; repository: string } }>(clawix.stdout);
  assert.equal(created.data.report.repository, "clawix");

  const submit = await runCliCapture(["report", "submit", created.data.report.id, "--workspace", workspace, "--confirm", "--dry-run", "--json"], workspace);
  const payload = parsePayload<{ submissionPlan: { repository: string; values: { owner: string; repo: string } } }>(submit.stdout);
  assert.equal(payload.data.submissionPlan.repository, "clawic/clawix");
  assert.equal(payload.data.submissionPlan.values.owner, "clawic");
  assert.equal(payload.data.submissionPlan.values.repo, "clawix");

  const listed = await runCliCapture(["report", "status", "--workspace", workspace, "--repo", "clawix", "--json"], workspace);
  const status = parsePayload<{ reports: Array<{ repository: string }> }>(listed.stdout);
  assert.equal(status.data.reports.length, 1);
  assert.equal(status.data.reports[0]?.repository, "clawix");
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

  const proposalWorkspace = tempWorkspace();
  const proposal = await runCliCapture(["report", "draft", "Fix obvious typo", "--workspace", proposalWorkspace, "--kind", "docs", "--destination", "pr_proposal", "--observed", "typo", "--expected", "fixed typo", "--repro", "read docs", "--json"], proposalWorkspace);
  const proposalCreated = parsePayload<{ report: { id: string; prProposal: { opensPullRequest: boolean; patchPlan: string[] } } }>(proposal.stdout);
  assert.equal(proposalCreated.data.report.prProposal.opensPullRequest, false);
  assert.equal(proposalCreated.data.report.prProposal.patchPlan.length > 0, true);
  const proposalSubmit = await runCliCapture(["report", "submit", proposalCreated.data.report.id, "--workspace", proposalWorkspace, "--confirm", "--dry-run", "--json"], proposalWorkspace);
  const proposalPayload = parsePayload<{ submissionPlan: { action: string; connectorOperationId: string } }>(proposalSubmit.stdout);
  assert.equal(proposalPayload.data.submissionPlan.action, "propose_pull_request_only");
  assert.equal(proposalPayload.data.submissionPlan.connectorOperationId, "proposal_only.no_github_mutation");
});

test("report check performs global dedupe search through the GitHub connector", async () => {
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
    const strong = await runCliCapture(["report", "bug", "Canonical issue duplicate", "--workspace", workspace, "--observed", "fails", "--expected", "works", "--repro", "run command", "--json"], workspace);
    const strongId = parsePayload<{ report: { id: string } }>(strong.stdout).data.report.id;
    const checked = await runCliCapture(["report", "check", strongId, "--workspace", workspace, "--github-base-url", fakeGitHub.url, "--json"], workspace);
    const payload = parsePayload<{ report: { globalDedupe: { recommendedAction: string }; canonicalCandidates: Array<{ source: string; number: number; strength: string }> } }>(checked.stdout);
    assert.equal(payload.data.report.globalDedupe.recommendedAction, "comment_on_canonical");
    assert.equal(payload.data.report.canonicalCandidates[0]?.source, "github_issue");
    assert.equal(payload.data.report.canonicalCandidates[0]?.number, 123);

    const medium = await runCliCapture(["report", "bug", "Medium candidate nearby extra", "--workspace", workspace, "--observed", "nearby problem", "--expected", "success", "--repro", "run command", "--json"], workspace);
    const mediumId = parsePayload<{ report: { id: string } }>(medium.stdout).data.report.id;
    const mediumSubmit = await runCliCapture(["report", "submit", mediumId, "--workspace", workspace, "--confirm", "--dry-run", "--github-base-url", fakeGitHub.url, "--json"], workspace);
    assert.equal(mediumSubmit.code, CLI_EXIT_FAILURE);
    assert.equal(JSON.parse(mediumSubmit.stdout).error.code, "global_dedupe_review_required");

    const none = await runCliCapture(["report", "bug", "Unique report with no match", "--workspace", workspace, "--observed", "unique", "--expected", "works", "--repro", "run command", "--json"], workspace);
    const noneId = parsePayload<{ report: { id: string } }>(none.stdout).data.report.id;
    const noneCheck = await runCliCapture(["report", "check", noneId, "--workspace", workspace, "--github-base-url", fakeGitHub.url, "--json"], workspace);
    const nonePayload = parsePayload<{ report: { globalDedupe: { recommendedAction: string }; canonicalCandidates: unknown[] } }>(noneCheck.stdout);
    assert.equal(nonePayload.data.report.globalDedupe.recommendedAction, "create_new_thread");
    assert.equal(nonePayload.data.report.canonicalCandidates.length, 0);
  } finally {
    delete process.env.CLAW_REPORT_GITHUB_TOKEN;
    await fakeGitHub.close();
  }
});

test("report github bootstrap plans and applies safe label setup only with confirmation", async () => {
  const workspace = tempWorkspace();
  const dryRun = await runCliCapture(["report", "github", "bootstrap", "--workspace", workspace, "--existing-labels", "source:agent", "--dry-run", "--json"], workspace);
  const dryRunPayload = parsePayload<{ dryRun: boolean; plan: { missingLabels: string[]; externalPending: string[] } }>(dryRun.stdout);
  assert.equal(dryRunPayload.data.dryRun, true);
  assert.equal(dryRunPayload.data.plan.missingLabels.includes("type:bug"), true);
  assert.equal(dryRunPayload.data.plan.externalPending.includes("discussion_category_creation"), true);

  let fakeGitHub: Awaited<ReturnType<typeof startFakeGitHubServer>>;
  try {
    fakeGitHub = await startFakeGitHubServer();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EPERM") return;
    throw error;
  }
  process.env.CLAW_REPORT_GITHUB_TOKEN = "offline-test-token";
  try {
    const applied = await runCliCapture(["report", "github", "bootstrap", "--workspace", workspace, "--apply", "--confirm", "--github-base-url", fakeGitHub.url, "--existing-labels", "source:agent,type:bug,type:crash,type:regression,type:feature,type:translation,type:docs,type:performance,type:ux-feedback,type:security,area:cli,area:host,area:storage,area:docs,area:ui,area:runtime,area:localization,area:unknown,platform:macos,platform:ios,platform:linux,platform:windows,platform:web,platform:unknown,severity:blocker,severity:high,severity:medium,severity:low,confidence:confirmed,confidence:probable,confidence:needs-info,state:draft,state:ready-for-review,state:external-pending,state:submitted,state:blocked,privacy:redacted,privacy:attachment-opt-in-required,privacy:private-security,route:issue,route:discussion-ideas,route:discussion-feedback,route:security-advisory,route:canonical-comment,route:pr-proposal,dedupe:canonical,dedupe:candidate", "--json"], workspace);
    const payload = parsePayload<{ applied: boolean; appliedLabels: string[]; externalPending: string[] }>(applied.stdout);
    assert.equal(payload.data.applied, true);
    assert.deepEqual(payload.data.appliedLabels, ["source:human-reviewed", "dedupe:commented"]);
    assert.equal(fakeGitHub.requests.filter((request) => request.path === "/repos/clawic/clawjs/labels").length, 2);
  } finally {
    delete process.env.CLAW_REPORT_GITHUB_TOKEN;
    await fakeGitHub.close();
  }
});

test("report retention commands export, preview prune, and require delete confirmation", async () => {
  const workspace = tempWorkspace();
  const privateAttachmentPath = ["/Users", "alice", "private.log"].join("/");
  const draft = await runCliCapture(["report", "bug", "Retention bug", "--workspace", workspace, "--observed", "bad", "--expected", "good", "--repro", "run", "--attachment", privateAttachmentPath, "--allow-attachment", "private.log", "--json"], workspace);
  const id = parsePayload<{ report: { id: string } }>(draft.stdout).data.report.id;
  const exported = await runCliCapture(["report", "export", id, "--workspace", workspace, "--include-attachment", "private.log", "--json"], workspace);
  const exportPayload = parsePayload<{ reports: Array<{ report: { attachments: Array<{ name: string }> }; omittedAttachments: string[] }> }>(exported.stdout);
  assert.equal(exportPayload.data.reports[0]?.report.attachments[0]?.name, "private.log");

  const unconfirmedDelete = await runCliCapture(["report", "delete", id, "--workspace", workspace, "--json"], workspace);
  assert.equal(unconfirmedDelete.code, CLI_EXIT_DEGRADED);
  const prune = await runCliCapture(["report", "prune", "--workspace", workspace, "--status", "ready_for_review", "--older-than", "0h", "--preview", "--json"], workspace);
  const prunePayload = parsePayload<{ preview: boolean; candidates: Array<{ id: string }> }>(prune.stdout);
  assert.equal(prunePayload.data.preview, true);
  assert.equal(prunePayload.data.candidates.some((candidate) => candidate.id === id), true);
});

test("report budgets limit noisy agents and allow audited override", async () => {
  const workspace = tempWorkspace();
  for (let index = 0; index < 20; index += 1) {
    const created = await runCliCapture(["report", "bug", `Budget bug ${index}`, "--workspace", workspace, "--agent-id", "agent_budget", "--observed", "bad", "--expected", "good", "--repro", String(index), "--json"], workspace);
    assert.equal(created.code, CLI_EXIT_OK);
  }
  const blocked = await runCliCapture(["report", "bug", "Budget bug blocked", "--workspace", workspace, "--agent-id", "agent_budget", "--observed", "bad", "--expected", "good", "--repro", "blocked", "--json"], workspace);
  assert.equal(blocked.code, CLI_EXIT_FAILURE);
  assert.equal(JSON.parse(blocked.stdout).error.code, "report_budget_exceeded");

  const override = await runCliCapture(["report", "budget", "override", "--workspace", workspace, "--agent-id", "agent_budget", "--reason", "human approved batch import", "--json"], workspace);
  assert.equal(override.code, CLI_EXIT_OK);
  const allowed = await runCliCapture(["report", "bug", "Budget bug override", "--workspace", workspace, "--agent-id", "agent_budget", "--observed", "bad", "--expected", "good", "--repro", "override", "--json"], workspace);
  assert.equal(allowed.code, CLI_EXIT_OK);
  const status = await runCliCapture(["report", "budget", "status", "--workspace", workspace, "--json"], workspace);
  const statusPayload = parsePayload<{ activeOverrides: unknown[]; recentEvents: Array<{ action: string; reason?: string }> }>(status.stdout);
  assert.equal(statusPayload.data.activeOverrides.length, 1);
  assert.equal(statusPayload.data.recentEvents.some((event) => event.action === "override" && event.reason === "human approved batch import"), true);
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
