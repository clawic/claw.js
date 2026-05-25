import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { resolveClawPersistentSurfacePath } from "@clawjs/core";

import { CLI_EXIT_DEGRADED, CLI_EXIT_FAILURE, CLI_EXIT_OK, CLI_EXIT_USAGE, CliHandledError } from "./cli-errors.ts";
import { joinedPositionals, parseCsvFlag, readBooleanFlag } from "./cli-flag-parsers.ts";
import {
  buildPrProposal,
  exportReportPackage,
  inferFineReportDestination,
  parseCsv,
  pruneCandidates,
  recordBudgetEvent,
  reportBudgetState,
  type CanonicalCandidate,
  type GlobalDedupeState,
  type ReportBudgetEvent,
  type ReportBudgetOverride,
  type ReportBudgetState,
  type ReportPrProposal,
  type ReportRetention,
} from "./cli-report-governance.ts";
import { budgetSummary, refreshGlobalDedupe, runBudgetCommand, runGitHubBootstrap } from "./cli-report-extra-commands.ts";
import { writeCommandJsonError, writeCommandJsonOk } from "./cli-json.ts";

type CliContext = {
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
  cwd: string;
};

type ReportKind = "bug" | "crash" | "regression" | "feature" | "translation" | "docs" | "performance" | "ux_feedback" | "security";
type ReportDestination = "github_issue" | "github_discussion_ideas" | "github_discussion_feedback" | "private_security_advisory" | "local_draft" | "canonical_comment" | "pr_proposal";
type ReportStatus = "draft" | "blocked" | "ready_for_review" | "approved" | "submitted" | "external_pending";
type ReportEvidence = { kind: "log" | "screenshot" | "trace" | "test" | "reproduction" | "version" | "environment" | "link" | "note"; label: string; value: string; redacted: boolean };
type ReportAttachment = { id: string; name: string; kind: string; optIn: boolean };
type ReportQuality = { ok: boolean; score: number; missing: string[]; blockers: string[]; signals: string[] };
type ReportPrivacy = { ok: boolean; redactedCount: number; blockedPublic: boolean; blockedReasons: string[]; attachmentOptInRequired: boolean };
type ReportDedupeCandidate = { reportId: string; fingerprint: string; title: string; status: ReportStatus; destination: ReportDestination; similarity: number };
type ReportApproval = { id: string; surface: "cli_preview" | "signed_host"; status: "required" | "approved" | "external_pending"; actor: string; approvedAt?: string; hostApprovalId?: string; reason?: string };
type ReportSubmissionReceipt = { id: string; connector: "claw-github"; connectorOperationId: string; status: "dry_run" | "external_pending" | "submitted"; createdAt: string; externalUrl?: string };
type ReportValidationPlan = { safeChecks: string[]; externalPending: string[]; prohibitedChecks: string[] };
type ReportRecord = {
  schemaVersion: 1;
  id: string;
  kind: ReportKind;
  status: ReportStatus;
  destination: ReportDestination;
  repository: "clawjs" | "clawix";
  title: string;
  summary: string;
  component?: string;
  locale?: string;
  observed?: string;
  expected?: string;
  impact?: string;
  frequency?: string;
  version?: string;
  commit?: string;
  platform?: string;
  installMethod?: string;
  hostMode?: string;
  confidence?: string;
  reproductionSteps: string[];
  evidence: ReportEvidence[];
  attachments: ReportAttachment[];
  labels: string[];
  fingerprint: string;
  quality: ReportQuality;
  privacy: ReportPrivacy;
  duplicateCandidates: ReportDedupeCandidate[];
  canonicalCandidates?: CanonicalCandidate[];
  globalDedupe?: GlobalDedupeState;
  budgetState?: ReportBudgetState;
  retention?: ReportRetention;
  prProposal?: ReportPrProposal;
  approvals: ReportApproval[];
  receipts: ReportSubmissionReceipt[];
  validationPlan?: ReportValidationPlan;
  createdByAgentId: string;
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
  externalUrl?: string;
  notes: string[];
};
type ReportGovernanceState = {
  schemaVersion: 1;
  fingerprintSalt: string;
  createdAt: string;
  updatedAt: string;
  reports: ReportRecord[];
  budgetEvents: ReportBudgetEvent[];
  budgetOverrides: ReportBudgetOverride[];
};

const REPORT_KINDS: readonly ReportKind[] = ["bug", "crash", "regression", "feature", "translation", "docs", "performance", "ux_feedback", "security"];
const REPORT_DESTINATIONS: readonly ReportDestination[] = ["github_issue", "github_discussion_ideas", "github_discussion_feedback", "private_security_advisory", "local_draft", "canonical_comment", "pr_proposal"];
const REPORT_STATUSES: readonly ReportStatus[] = ["draft", "blocked", "ready_for_review", "approved", "submitted", "external_pending"];
const REPORT_SUBCOMMANDS = ["draft", "bug", "feature", "translation", "security", "check", "dedupe", "preview", "submit", "status", "triage", "templates", "github", "export", "delete", "prune", "budget"] as const;

const REPORT_LABELS = {
  source: ["source:agent", "source:human-reviewed"],
  type: ["type:bug", "type:crash", "type:regression", "type:feature", "type:translation", "type:docs", "type:performance", "type:ux-feedback", "type:security"],
  area: ["area:cli", "area:host", "area:storage", "area:docs", "area:ui", "area:runtime", "area:localization", "area:unknown"],
  platform: ["platform:macos", "platform:ios", "platform:linux", "platform:windows", "platform:web", "platform:unknown"],
  severity: ["severity:blocker", "severity:high", "severity:medium", "severity:low"],
  confidence: ["confidence:confirmed", "confidence:probable", "confidence:needs-info"],
  state: ["state:draft", "state:ready-for-review", "state:external-pending", "state:submitted", "state:blocked"],
  privacy: ["privacy:redacted", "privacy:attachment-opt-in-required", "privacy:private-security"],
  routing: ["route:issue", "route:discussion-ideas", "route:discussion-feedback", "route:security-advisory", "route:canonical-comment", "route:pr-proposal"],
  dedupe: ["dedupe:canonical", "dedupe:candidate", "dedupe:commented"],
} as const;

const REPORT_DISCUSSION_CATEGORIES = ["Ideas", "Feedback"] as const;

export async function runReportCli(input: {
  positionals: string[];
  flags: Record<string, string>;
  argv: string[];
  context: CliContext;
  wantsJson: boolean;
  binName: string;
  workspaceRoot: string;
  agentId: string;
}): Promise<number> {
  const { positionals, flags, argv, context, wantsJson, binName, workspaceRoot, agentId } = input;
  const [, command, subcommand] = positionals;

  try {
    if (!command || command === "help") {
      writeUsage(context, binName);
      return CLI_EXIT_OK;
    }

    validateReportRepositoryFlag(flags.repo);
    validateReportKindFlag(flags.kind);
    validateReportDestinationFlag(flags.destination);
    const state = readReportState(workspaceRoot);
    const save = () => writeReportState(workspaceRoot, state);
    const findReport = (id: string | undefined): ReportRecord => {
      const report = state.reports.find((candidate) => candidate.id === id);
      if (!report) throw new CliHandledError("not_found", `Report not found: ${id ?? ""}`, CLI_EXIT_FAILURE);
      return report;
    };

    if (command === "templates") {
      return writeReportResult(context, wantsJson, command, {
        kinds: REPORT_KINDS,
        destinations: REPORT_DESTINATIONS,
        discussionCategories: REPORT_DISCUSSION_CATEGORIES,
        labels: REPORT_LABELS,
        requiredApproval: "preview_then_human_confirm",
        attachmentPolicy: "Each attachment must be explicitly opted in; full local paths are never persisted.",
      });
    }

    if (command === "github" && subcommand === "bootstrap") {
      return await runGitHubBootstrap({ state, flags, argv, context, wantsJson, save, reportLabels: REPORT_LABELS, nowIso });
    }

    if (command === "budget") {
      return runBudgetCommand({ state, subcommand, flags, argv, context, wantsJson, save, nowIso });
    }

    if (command === "export") {
      const target = subcommand ?? flags.id;
      const now = nowIso();
      const includeAttachments = parseCsv(flags["include-attachment"] ?? flags["include-attachments"]);
      const reports = target === "--all" || readBooleanFlag(argv, flags, "all", false)
        ? state.reports
        : [findReport(target)];
      for (const report of reports) {
        report.retention = { policy: "manual_prune", exportRedactedByDefault: true, deleteRequiresConfirmation: true, lastExportedAt: now };
        report.updatedAt = now;
      }
      state.updatedAt = now;
      save();
      return writeReportResult(context, wantsJson, "export", {
        exportedAt: now,
        reports: reports.map((report) => exportReportPackage(report, includeAttachments, now)),
      });
    }

    if (command === "delete") {
      const report = findReport(subcommand ?? flags.id);
      if (!readBooleanFlag(argv, flags, "confirm", false)) {
        return writeReportResult(context, wantsJson, "delete", {
          reportId: report.id,
          deleteRequiresConfirmation: true,
          command: `${binName} report delete ${report.id} --confirm`,
        }, CLI_EXIT_DEGRADED);
      }
      state.reports = state.reports.filter((candidate) => candidate.id !== report.id);
      state.updatedAt = nowIso();
      save();
      return writeReportResult(context, wantsJson, "delete", { deleted: true, reportId: report.id });
    }

    if (command === "prune") {
      const now = nowIso();
      const candidates = pruneCandidates(state.reports, flags, now);
      const preview = readBooleanFlag(argv, flags, "preview", false);
      const confirmed = readBooleanFlag(argv, flags, "confirm", false);
      if (preview || !confirmed) {
        return writeReportResult(context, wantsJson, "prune", {
          deleted: false,
          preview: true,
          candidates: candidates.map((report) => ({ id: report.id, status: report.status, kind: report.kind, repository: report.repository, updatedAt: report.updatedAt })),
          deleteRequiresConfirmation: true,
        });
      }
      const ids = new Set(candidates.map((report) => report.id));
      state.reports = state.reports.filter((report) => !ids.has(report.id));
      state.updatedAt = now;
      save();
      return writeReportResult(context, wantsJson, "prune", { deleted: candidates.length, reportIds: [...ids] });
    }

    if (command === "status" || command === "list") {
      const reports = state.reports
        .filter((report) => !flags.status || report.status === flags.status)
        .filter((report) => !flags.kind || report.kind === flags.kind)
        .filter((report) => !flags.repo || report.repository === flags.repo);
      return writeReportResult(context, wantsJson, "status", { reports });
    }

    if (command === "triage") {
      const reports = state.reports
        .filter((report) => !flags.status || report.status === flags.status)
        .filter((report) => !flags.repo || report.repository === flags.repo)
        .map((report) => triageRecommendation(report));
      return writeReportResult(context, wantsJson, "triage", {
        queue: reports,
        budget: budgetSummary(state, nowIso()),
        automationAuthority: "recommend_label_score_dedupe_only",
        prohibitedActions: ["close", "lock", "delete", "publish_without_human_approval"],
      });
    }

    if (["draft", "bug", "feature", "translation", "security"].includes(command)) {
      const report = createReport({ command, positionals, flags, argv, state, agentId, cwd: context.cwd });
      report.budgetState = reportBudgetState(state, report, "draft", nowIso());
      if (report.budgetState.status === "limited") {
        throw new CliHandledError("report_budget_exceeded", `Report budget exceeded: ${report.budgetState.blockers.join(", ")}`, CLI_EXIT_FAILURE);
      }
      recordBudgetEvent(state, report, "draft", nowIso());
      state.reports.unshift(report);
      state.updatedAt = nowIso();
      save();
      return writeReportResult(context, wantsJson, command, { report, next: nextStepsFor(report) });
    }

    if (command === "check") {
      const report = findReport(subcommand ?? flags.id);
      const checked = refreshReport(report, state, flags);
      await refreshGlobalDedupe(checked, flags, nowIso);
      Object.assign(report, checked, { updatedAt: nowIso() });
      state.updatedAt = report.updatedAt;
      save();
      return writeReportResult(context, wantsJson, "check", {
        report,
        canPublish: report.quality.ok && !report.privacy.blockedPublic,
        notEnoughInfo: report.quality.blockers.includes("NOT_ENOUGH_INFO"),
      });
    }

    if (command === "dedupe") {
      const report = findReport(subcommand ?? flags.id);
      report.duplicateCandidates = findDuplicateCandidates(report, state);
      report.updatedAt = nowIso();
      state.updatedAt = report.updatedAt;
      save();
      return writeReportResult(context, wantsJson, "dedupe", {
        reportId: report.id,
        canonicalAction: report.duplicateCandidates.length > 0 ? "comment_on_canonical" : "create_new_thread",
        candidates: report.duplicateCandidates,
      });
    }

    if (command === "preview") {
      const report = findReport(subcommand ?? flags.id);
      return writeReportResult(context, wantsJson, "preview", {
        reportId: report.id,
        destination: report.destination,
        repository: report.repository,
        labels: report.labels,
        markdown: renderReportMarkdown(report),
        approvalRequired: true,
        attachmentPolicy: report.attachments.length > 0 ? "Only opted-in attachment names are included in the preview." : "No attachments.",
      });
    }

    if (command === "submit") {
      const report = findReport(subcommand ?? flags.id);
      const confirmed = readBooleanFlag(argv, flags, "confirm", false) || readBooleanFlag(argv, flags, "approved", false);
      const dryRun = readBooleanFlag(argv, flags, "dry-run", false);
      await refreshGlobalDedupe(report, flags, nowIso);
      const budgetAction = confirmed && dryRun && report.destination !== "pr_proposal" ? "dry_run_submit" : "publish_prompt";
      report.budgetState = reportBudgetState(state, report, budgetAction, nowIso());
      if (report.budgetState.status === "limited") {
        report.status = "blocked";
        report.updatedAt = nowIso();
        state.updatedAt = report.updatedAt;
        save();
        throw new CliHandledError("report_budget_exceeded", `Report budget exceeded: ${report.budgetState.blockers.join(", ")}`, CLI_EXIT_FAILURE);
      }
      if (report.globalDedupe?.recommendedAction === "review_candidates") {
        report.status = "blocked";
        report.updatedAt = nowIso();
        state.updatedAt = report.updatedAt;
        save();
        throw new CliHandledError("global_dedupe_review_required", "Global dedupe found medium-confidence canonical candidates; review before publishing.", CLI_EXIT_FAILURE);
      }
      const privacyBlockers = publicationPrivacyBlockers(report);
      if (privacyBlockers.length > 0) {
        report.status = "blocked";
        report.updatedAt = nowIso();
        state.updatedAt = report.updatedAt;
        save();
        throw new CliHandledError("privacy_blocked", `Report publication blocked: ${privacyBlockers.join(", ")}`, CLI_EXIT_FAILURE);
      }
      if (!report.quality.ok) {
        report.status = "blocked";
        report.updatedAt = nowIso();
        state.updatedAt = report.updatedAt;
        save();
        throw new CliHandledError("not_enough_info", `NOT_ENOUGH_INFO: ${report.quality.missing.join(", ")}`, CLI_EXIT_FAILURE);
      }
      if (!confirmed) {
        report.status = "ready_for_review";
        report.updatedAt = nowIso();
        report.approvals = requiredApprovals(report, flags);
        report.labels = buildLabels(report);
        recordBudgetEvent(state, report, "publish_prompt", report.updatedAt);
        state.updatedAt = report.updatedAt;
        save();
        return writeReportResult(context, wantsJson, "submit", {
          report,
          approvalRequired: true,
          approvalSurface: approvalSurface(report, flags, false),
          command: `${binName} report preview ${report.id}`,
          next: `${binName} report submit ${report.id} --confirm --dry-run`,
        });
      }
      report.status = dryRun ? "ready_for_review" : "external_pending";
      report.updatedAt = nowIso();
      report.approvals = approvedApprovals(report, flags);
      report.labels = buildLabels(report);
      recordBudgetEvent(state, report, budgetAction, report.updatedAt);
      const submissionPlan = buildSubmissionPlan(report, flags);
      const liveReceipt = !dryRun && readBooleanFlag(argv, flags, "execute", false)
        ? await executeReportSubmission(report, submissionPlan, flags)
        : null;
      if (liveReceipt) {
        report.status = "submitted";
        report.externalUrl = liveReceipt.externalUrl;
        report.labels = buildLabels(report);
      }
      report.receipts.unshift({
        id: `receipt_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`,
        connector: "claw-github",
        connectorOperationId: String(submissionPlan.connectorOperationId),
        status: liveReceipt ? "submitted" : dryRun ? "dry_run" : "external_pending",
        createdAt: report.updatedAt,
        ...(liveReceipt?.externalUrl ? { externalUrl: liveReceipt.externalUrl } : {}),
      });
      state.updatedAt = report.updatedAt;
      save();
      return writeReportResult(context, wantsJson, "submit", {
        report,
        dryRun,
        connector: "claw-github",
        externalPending: !dryRun && !liveReceipt,
        approvalSurface: approvalSurface(report, flags, true),
        publicationIdentity: publicationIdentity(flags),
        submissionPlan,
        ...(liveReceipt ? { receipt: liveReceipt } : {}),
      }, dryRun || liveReceipt ? CLI_EXIT_OK : CLI_EXIT_DEGRADED);
    }

    return writeReportUsage({ context, wantsJson, binName, command });
  } catch (error) {
    if (wantsJson) writeCommandJsonError(context.stdout, "report", error);
    else context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return error instanceof CliHandledError ? error.exitCode : CLI_EXIT_FAILURE;
  }
}

function writeReportUsage(input: { context: CliContext; wantsJson: boolean; binName: string; command: string | undefined }): number {
  if (input.wantsJson) {
    const received = input.command ?? null;
    writeCommandJsonError(input.context.stdout, "report", new CliHandledError(
      "unknown_report_subcommand",
      received ? `Unknown report subcommand: ${received}.` : "Missing report subcommand.",
      CLI_EXIT_USAGE,
      {
        location: "cli.report.subcommand",
        suggestion: "Use a registered report subcommand for report drafting, checking, preview, submission, retention, or budget work.",
        safeNextStep: `Run ${input.binName} report templates --json to inspect valid report kinds and destinations, or ${input.binName} help report --json for the report command surface.`,
        details: {
          received,
          validSubcommands: [...REPORT_SUBCOMMANDS],
        },
      },
    ), { subcommand: received });
    return CLI_EXIT_USAGE;
  }

  input.context.stderr.write(`Usage: ${input.binName} report ${REPORT_SUBCOMMANDS.join("|")}\n`);
  return CLI_EXIT_USAGE;
}

function createReport(input: {
  command: string;
  positionals: string[];
  flags: Record<string, string>;
  argv: string[];
  state: ReportGovernanceState;
  agentId: string;
  cwd: string;
}): ReportRecord {
  const kind = inferKind(input.command, input.flags);
  const rawTitle = input.flags.title ?? joinedPositionals(input.positionals, 2);
  const redactor = createRedactor();
  const title = redactor.sanitize(rawTitle ?? defaultTitleFor(kind));
  const summary = redactor.sanitize(input.flags.summary ?? input.flags.description ?? title);
  const observed = sanitizeOptional(redactor, input.flags.observed ?? input.flags.actual);
  const expected = sanitizeOptional(redactor, input.flags.expected);
  const impact = sanitizeOptional(redactor, input.flags.impact);
  const frequency = sanitizeOptional(redactor, input.flags.frequency);
  const component = sanitizeOptional(redactor, input.flags.component ?? input.flags.area);
  const locale = sanitizeOptional(redactor, input.flags.locale ?? input.flags.language);
  const version = sanitizeOptional(redactor, input.flags.version);
  const commit = sanitizeOptional(redactor, input.flags.commit ?? input.flags.sha);
  const platform = sanitizeOptional(redactor, input.flags.platform ?? input.flags.os);
  const installMethod = sanitizeOptional(redactor, input.flags["install-method"] ?? input.flags.install);
  const hostMode = sanitizeOptional(redactor, input.flags["host-mode"] ?? input.flags.host);
  const confidence = sanitizeOptional(redactor, input.flags.confidence);
  const reproductionSteps = splitSteps(redactor.sanitize(input.flags.repro ?? input.flags.reproduction ?? input.flags.steps ?? ""));
  const repository = input.flags.repo === "clawix" ? "clawix" : "clawjs";
  const attachments = parseAttachments(input.argv, input.flags, input.cwd);
  const destination = inferDestination(kind, input.flags, title, observed);
  const evidence: ReportRecord["evidence"] = buildEvidence(input.flags, redactor);
  const base: Omit<ReportRecord, "quality" | "privacy" | "duplicateCandidates" | "labels" | "fingerprint"> = {
    schemaVersion: 1,
    id: input.flags.id ?? reportId(),
    kind,
    status: "draft",
    destination,
    repository,
    title,
    summary,
    ...(component ? { component } : {}),
    ...(locale ? { locale } : {}),
    ...(observed ? { observed } : {}),
    ...(expected ? { expected } : {}),
    ...(impact ? { impact } : {}),
    ...(frequency ? { frequency } : {}),
    ...(version ? { version } : {}),
    ...(commit ? { commit } : {}),
    ...(platform ? { platform } : {}),
    ...(installMethod ? { installMethod } : {}),
    ...(hostMode ? { hostMode } : {}),
    ...(confidence ? { confidence } : {}),
    reproductionSteps,
    evidence,
    attachments,
    approvals: [],
    receipts: [],
    validationPlan: undefined,
    createdByAgentId: input.flags.agent ?? input.flags["agent-id"] ?? input.agentId,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    notes: [],
  };
  const fingerprint = createFingerprint(input.state.fingerprintSalt, base);
  const privacy = reviewPrivacy({ redactedCount: redactor.count, kind, destination, attachments });
  const report: ReportRecord = {
    ...base,
    fingerprint,
    privacy,
    quality: emptyQuality(),
    duplicateCandidates: [],
    labels: [],
  };
  report.quality = evaluateQuality(report);
  report.duplicateCandidates = findDuplicateCandidates(report, input.state);
  report.prProposal = buildPrProposal(report, input.flags);
  report.retention = { policy: "manual_prune", exportRedactedByDefault: true, deleteRequiresConfirmation: true };
  report.validationPlan = buildValidationPlan(report);
  report.status = report.quality.ok ? "ready_for_review" : "draft";
  report.labels = buildLabels(report);
  return normalizeReportRecord(report);
}

function refreshReport(report: ReportRecord, state: ReportGovernanceState, flags: Record<string, string>): ReportRecord {
  const destination = flags.destination ? inferDestination(report.kind, flags, report.title, report.observed) : report.destination;
  const refreshed = { ...report, destination };
  refreshed.privacy = reviewPrivacy({
    redactedCount: report.privacy.redactedCount,
    kind: refreshed.kind,
    destination,
    attachments: refreshed.attachments,
  });
  refreshed.quality = evaluateQuality(refreshed);
  refreshed.duplicateCandidates = findDuplicateCandidates(refreshed, state);
  refreshed.prProposal = buildPrProposal(refreshed, flags);
  refreshed.validationPlan = buildValidationPlan(refreshed);
  refreshed.status = refreshed.quality.ok ? "ready_for_review" : "draft";
  refreshed.labels = buildLabels(refreshed);
  return refreshed;
}

function inferKind(command: string, flags: Record<string, string>): ReportKind {
  if (command === "bug") return "bug";
  if (command === "feature") return flags.feedback === "true" ? "ux_feedback" : "feature";
  if (command === "translation") return "translation";
  if (command === "security") return "security";
  const raw = flags.kind ?? "bug";
  return isReportKind(raw)
    ? raw as ReportKind
    : "bug";
}

function inferDestination(kind: ReportKind, flags: Record<string, string>, title = "", observed?: string): ReportDestination {
  if (kind === "security") return "private_security_advisory";
  if (flags.destination && isReportDestination(flags.destination)) {
    return flags.destination as ReportDestination;
  }
  const fine = inferFineReportDestination(kind, flags, title, observed);
  if (fine && isReportDestination(fine)) return fine;
  if (kind === "feature") return "github_discussion_ideas";
  if (kind === "ux_feedback") return "github_discussion_feedback";
  return "github_issue";
}

function buildEvidence(flags: Record<string, string>, redactor: ReturnType<typeof createRedactor>): ReportRecord["evidence"] {
  const evidence: ReportRecord["evidence"] = parseCsvFlag(flags.evidence).map((value) => ({
    kind: "note" as const,
    label: "evidence",
    value: redactor.sanitize(value),
    redacted: redactor.count > 0,
  }));
  if (flags.version) evidence.push({ kind: "version", label: "version", value: redactor.sanitize(flags.version), redacted: false });
  if (flags.platform) evidence.push({ kind: "environment", label: "platform", value: redactor.sanitize(flags.platform), redacted: false });
  if (flags.logs) evidence.push({ kind: "log", label: "log excerpt", value: redactor.sanitize(flags.logs), redacted: redactor.count > 0 });
  return evidence;
}

function parseAttachments(argv: string[], flags: Record<string, string>, cwd: string): ReportRecord["attachments"] {
  const requested = [...parseCsvFlag(flags.attachment), ...parseCsvFlag(flags.attachments)];
  const allowValues = [...parseCsvFlag(flags["allow-attachment"]), ...parseCsvFlag(flags["allow-attachments"])];
  const allowedNames = new Set(allowValues.filter(isSimpleAttachmentName));
  const allowedPaths = new Set(allowValues.filter((value) => !isSimpleAttachmentName(value)).map((value) => normalizeAttachmentPath(cwd, value)));
  const allowAll = argv.includes("--allow-all-attachments");
  return requested.map((entry, index) => {
    const name = path.basename(entry);
    const requestedPath = normalizeAttachmentPath(cwd, entry);
    return {
      id: `att_${index + 1}`,
      name,
      kind: inferAttachmentKind(name),
      optIn: allowAll || allowedNames.has(name) || allowedPaths.has(requestedPath),
    };
  });
}

function isSimpleAttachmentName(value: string): boolean {
  return value === path.basename(value) && value === path.win32.basename(value) && !path.isAbsolute(value) && !path.win32.isAbsolute(value);
}

function normalizeAttachmentPath(cwd: string, value: string): string {
  return path.normalize(path.resolve(cwd, value));
}

function inferAttachmentKind(name: string): string {
  const extension = path.extname(name).toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp"].includes(extension)) return "screenshot";
  if ([".log", ".txt"].includes(extension)) return "log";
  if ([".json", ".trace"].includes(extension)) return "trace";
  return "file";
}

function evaluateQuality(report: ReportRecord): ReportRecord["quality"] {
  const missing: string[] = [];
  const signals: string[] = [];
  if (!report.title) missing.push("title");
  if (!report.summary) missing.push("summary");
  if (["bug", "crash", "regression", "performance"].includes(report.kind)) {
    if (!report.observed) missing.push("observed");
    if (!report.expected) missing.push("expected");
    if (report.reproductionSteps.length === 0 && report.evidence.length === 0) missing.push("reproduction_or_evidence");
  }
  if (report.kind === "translation") {
    if (!report.locale) missing.push("locale");
    if (!report.observed) missing.push("bad_translation");
    if (!report.expected) missing.push("suggested_translation");
  }
  if (report.kind === "feature" || report.kind === "ux_feedback") {
    if (!report.impact && !report.observed) missing.push("problem_or_impact");
  }
  if (report.kind === "security" && !report.impact) missing.push("security_impact");
  if (report.evidence.length > 0) signals.push("evidence_attached");
  if (report.reproductionSteps.length > 0) signals.push("reproduction_steps");
  if (report.duplicateCandidates.length > 0) signals.push("dedupe_candidates");
  const blockers = missing.length > 0 ? ["NOT_ENOUGH_INFO"] : [];
  const privacyBlockers = publicationPrivacyBlockers(report);
  if (privacyBlockers.length > 0) blockers.push("PRIVACY_BLOCKED");
  const score = Math.max(0, 100 - missing.length * 20 - blockers.length * 20);
  return { ok: blockers.length === 0, score, missing, blockers, signals };
}

function emptyQuality(): ReportRecord["quality"] {
  return { ok: false, score: 0, missing: [], blockers: [], signals: [] };
}

function reviewPrivacy(input: {
  redactedCount: number;
  kind: ReportKind;
  destination: ReportDestination;
  attachments: ReportRecord["attachments"];
}): ReportRecord["privacy"] {
  const attachmentOptInRequired = input.attachments.some((attachment) => !attachment.optIn);
  const blockedReasons: string[] = [];
  if (input.kind === "security" && input.destination !== "private_security_advisory") blockedReasons.push("security_reports_must_use_private_security_advisory");
  if (attachmentOptInRequired) blockedReasons.push("attachment_opt_in_required");
  return {
    ok: blockedReasons.length === 0,
    redactedCount: input.redactedCount,
    blockedPublic: blockedReasons.length > 0,
    blockedReasons,
    attachmentOptInRequired,
  };
}

function publicationPrivacyBlockers(report: Pick<ReportRecord, "destination" | "privacy">): string[] {
  const blockers = new Set<string>();
  if (report.privacy.attachmentOptInRequired) blockers.add("attachment_opt_in_required");
  if (report.privacy.blockedPublic && report.destination !== "private_security_advisory") {
    for (const reason of report.privacy.blockedReasons) blockers.add(reason);
  }
  return [...blockers];
}

function buildLabels(report: ReportRecord): string[] {
  const labels = new Set<string>(["source:agent", `type:${report.kind.replace("_", "-")}`]);
  labels.add(`route:${routeLabel(report.destination)}`);
  labels.add(report.quality.ok ? confidenceLabel(report.confidence) : "confidence:needs-info");
  labels.add(`state:${report.status.replaceAll("_", "-")}`);
  labels.add(severityLabel(report));
  labels.add(report.privacy.redactedCount > 0 ? "privacy:redacted" : "privacy:reviewed");
  if (report.privacy.attachmentOptInRequired) labels.add("privacy:attachment-opt-in-required");
  if (report.destination === "private_security_advisory") labels.add("privacy:private-security");
  labels.add(`area:${normalizeLabelValue(report.component ?? "unknown")}`);
  labels.add(platformLabel(report.platform));
  labels.add(report.duplicateCandidates.length > 0 ? "dedupe:candidate" : "dedupe:canonical");
  return [...labels].sort();
}

function confidenceLabel(value: string | undefined): string {
  const normalized = normalizeLabelValue(value ?? "probable");
  if (normalized === "confirmed") return "confidence:confirmed";
  if (normalized === "needs-info") return "confidence:needs-info";
  return "confidence:probable";
}

function severityLabel(report: ReportRecord): string {
  const text = `${report.impact ?? ""} ${report.frequency ?? ""}`.toLowerCase();
  if (text.includes("blocker") || text.includes("critical") || text.includes("crash") || text.includes("security")) return "severity:blocker";
  if (text.includes("high") || text.includes("many") || text.includes("data loss")) return "severity:high";
  if (text.includes("low") || text.includes("minor")) return "severity:low";
  return "severity:medium";
}

function platformLabel(value: string | undefined): string {
  const normalized = normalizeLabelValue(value ?? "unknown");
  if (normalized.includes("mac")) return "platform:macos";
  if (normalized.includes("ios") || normalized.includes("iphone")) return "platform:ios";
  if (normalized.includes("linux")) return "platform:linux";
  if (normalized.includes("win")) return "platform:windows";
  if (normalized.includes("web") || normalized.includes("browser")) return "platform:web";
  return "platform:unknown";
}

function routeLabel(destination: ReportDestination): string {
  if (destination === "github_discussion_ideas") return "discussion-ideas";
  if (destination === "github_discussion_feedback") return "discussion-feedback";
  if (destination === "private_security_advisory") return "security-advisory";
  if (destination === "canonical_comment") return "canonical-comment";
  if (destination === "pr_proposal") return "pr-proposal";
  return "issue";
}

function normalizeLabelValue(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unknown";
}

function createFingerprint(salt: string, report: Omit<ReportRecord, "quality" | "privacy" | "duplicateCandidates" | "labels" | "fingerprint">): string {
  const basis = [
    salt,
    report.repository,
    report.kind,
    report.component ?? "",
    normalizeFingerprintText(report.title),
    normalizeFingerprintText(report.summary),
    normalizeFingerprintText(report.observed ?? ""),
    normalizeFingerprintText(report.expected ?? ""),
  ].join("\n");
  return createHash("sha256").update(basis).digest("hex").slice(0, 24);
}

function normalizeFingerprintText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ").filter((part) => part.length > 2).slice(0, 40).join(" ");
}

function findDuplicateCandidates(report: ReportRecord, state: ReportGovernanceState): ReportRecord["duplicateCandidates"] {
  return state.reports
    .filter((candidate) => candidate.id !== report.id)
    .map((candidate) => ({
      reportId: candidate.id,
      fingerprint: candidate.fingerprint,
      title: candidate.title,
      status: candidate.status,
      destination: candidate.destination,
      similarity: candidate.fingerprint === report.fingerprint ? 1 : fingerprintSimilarity(report, candidate),
    }))
    .filter((candidate) => candidate.similarity >= 0.72)
    .sort((left, right) => right.similarity - left.similarity)
    .slice(0, 5);
}

function fingerprintSimilarity(left: ReportRecord, right: ReportRecord): number {
  const leftTokens = new Set(normalizeFingerprintText(`${left.title} ${left.summary} ${left.observed ?? ""}`).split(" ").filter(Boolean));
  const rightTokens = new Set(normalizeFingerprintText(`${right.title} ${right.summary} ${right.observed ?? ""}`).split(" ").filter(Boolean));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  const overlap = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return overlap / Math.max(leftTokens.size, rightTokens.size);
}

function createRedactor() {
  let count = 0;
  const hostname = os.hostname();
  const replacements: Array<[RegExp, string]> = [
    [/github_pat_[A-Za-z0-9_]+/g, "<redacted-token>"],
    [/gh[pousr]_[A-Za-z0-9_]{20,}/g, "<redacted-token>"],
    [/sk-[A-Za-z0-9_-]{20,}/g, "<redacted-token>"],
    [/AKIA[0-9A-Z]{16}/g, "<redacted-token>"],
    [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "<redacted-private-key>"],
    [/Authorization:\s*[^\n\r]+/gi, "Authorization: <redacted>"],
    [/((?:API[_-]?KEY|TOKEN|SECRET|PASSWORD|SIGN[_-]?IDENTITY|TEAM[_-]?ID)=)[^\s\n\r]+/gi, "$1<redacted>"],
    [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "<redacted-email>"],
    [/\/Users\/[^/\s]+/g, "/Users/<redacted>"],
    [/https?:\/\/[^\s"'`]*(?:internal|corp|private|\.local|\.lan)[^\s"'`]*/gi, "<redacted-private-url>"],
    [/([?&](?:token|key|secret|auth|password)=)[^&\s]+/gi, "$1<redacted>"],
  ];
  if (hostname) replacements.push([new RegExp(escapeRegExp(hostname), "g"), "<redacted-hostname>"]);
  return {
    get count() {
      return count;
    },
    sanitize(value: string): string {
      let output = value;
      for (const [pattern, replacement] of replacements) {
        output = output.replace(pattern, (match, prefix) => {
          count += 1;
          return typeof prefix === "string" && replacement.includes("$1") ? replacement.replace("$1", prefix) : replacement;
        });
      }
      return output.trim();
    },
  };
}

function sanitizeOptional(redactor: ReturnType<typeof createRedactor>, value: string | undefined): string | undefined {
  const sanitized = value ? redactor.sanitize(value) : "";
  return sanitized || undefined;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function splitSteps(value: string): string[] {
  return value.split(/\n|;/).map((step) => step.trim().replace(/^\d+[.)]\s*/, "")).filter(Boolean);
}

function defaultTitleFor(kind: ReportKind): string {
  if (kind === "feature") return "Feature request";
  if (kind === "translation") return "Translation issue";
  if (kind === "security") return "Security report";
  return "Bug report";
}

function renderReportMarkdown(report: ReportRecord): string {
  const lines = [
    `# ${report.title}`,
    "",
    `Repository: ${report.repository}`,
    `Kind: ${report.kind}`,
    `Destination: ${report.destination}`,
    `Fingerprint: ${report.fingerprint}`,
    "",
    "## Summary",
    report.summary,
    "",
  ];
  if (report.observed) lines.push("## Observed", report.observed, "");
  if (report.expected) lines.push("## Expected", report.expected, "");
  if (report.reproductionSteps.length > 0) lines.push("## Reproduction", ...report.reproductionSteps.map((step, index) => `${index + 1}. ${step}`), "");
  if (report.impact) lines.push("## Impact", report.impact, "");
  if (report.locale) lines.push("## Locale", report.locale, "");
  if (report.evidence.length > 0) lines.push("## Evidence", ...report.evidence.map((item) => `- ${item.kind}: ${item.value}`), "");
  if (report.globalDedupe) {
    lines.push("## Global Dedupe", `- Status: ${report.globalDedupe.status}`, `- Recommended: ${report.globalDedupe.recommendedAction}`, "");
  }
  if (report.prProposal) {
    lines.push("## PR Proposal", `- Opens PR automatically: ${report.prProposal.opensPullRequest}`, "");
    if (report.prProposal.suspectedFiles.length > 0) lines.push("### Suspected Files", ...report.prProposal.suspectedFiles.map((file) => `- ${file}`), "");
    lines.push("### Patch Plan", ...report.prProposal.patchPlan.map((step) => `- ${step}`), "");
    lines.push("### Tests", ...report.prProposal.tests.map((step) => `- ${step}`), "");
    lines.push("### Risks", ...report.prProposal.risks.map((risk) => `- ${risk}`), "");
  }
  const optedIn = report.attachments.filter((attachment) => attachment.optIn);
  if (optedIn.length > 0) lines.push("## Attachments Approved By User", ...optedIn.map((attachment) => `- ${attachment.name} (${attachment.kind})`), "");
  lines.push("## Quality Gates", `- Score: ${report.quality.score}`, `- Blockers: ${report.quality.blockers.join(", ") || "none"}`, "");
  lines.push("## Privacy", `- Redactions: ${report.privacy.redactedCount}`, `- Blocked public: ${report.privacy.blockedPublic}`, "");
  return `${lines.join("\n").trim()}\n`;
}

function buildSubmissionPlan(report: ReportRecord, flags: Record<string, string> = {}): Record<string, unknown> {
  return {
    repository: report.repository === "clawix" ? "clawic/clawix" : "clawic/clawjs",
    destination: report.destination,
    connector: "claw-github",
    connectorPackage: "@clawjs/integrations",
    connectorOperationId: connectorOperationFor(report),
    action: shouldCommentOnCanonical(report) ? "comment_on_canonical" : destinationAction(report.destination),
    labels: report.labels,
    values: connectorValuesFor(report, flags),
    markdown: renderReportMarkdown(report),
  };
}

async function executeReportSubmission(
  report: ReportRecord,
  submissionPlan: Record<string, unknown>,
  flags: Record<string, string>,
): Promise<{ status: "submitted"; externalUrl?: string; response: unknown }> {
  if (!flags["host-approval-id"]) {
    throw new CliHandledError("host_approval_required", "Live report submission requires --host-approval-id from the signed host approval flow.", CLI_EXIT_FAILURE);
  }
  if (submissionPlan.connectorOperationId === "proposal_only.no_github_mutation") {
    throw new CliHandledError("pr_proposal_only", "PR proposal reports do not create GitHub pull requests from claw report.", CLI_EXIT_FAILURE);
  }
  if (String(submissionPlan.connectorOperationId).startsWith("external_pending.")) {
    throw new CliHandledError("external_pending", `Live submission is EXTERNAL PENDING for ${String(submissionPlan.connectorOperationId)}.`, CLI_EXIT_DEGRADED);
  }
  const baseUrl = flags["github-base-url"];
  if (!baseUrl || !isLocalHttpBaseUrl(baseUrl)) {
    throw new CliHandledError("external_pending", "Live GitHub submission is EXTERNAL PENDING unless --github-base-url points at a local fake/test server.", CLI_EXIT_DEGRADED);
  }
  const tokenEnv = flags["github-token-env"] ?? "CLAW_REPORT_GITHUB_TOKEN";
  const githubToken = process.env[tokenEnv];
  if (!githubToken) {
    throw new CliHandledError("missing_github_token", `Missing GitHub token env var: ${tokenEnv}`, CLI_EXIT_FAILURE);
  }
  const connectorOperationId = String(submissionPlan.connectorOperationId);
  const values = submissionPlan.values;
  if (!values || typeof values !== "object" || Array.isArray(values)) {
    throw new CliHandledError("invalid_submission_plan", "Submission plan is missing connector values.", CLI_EXIT_FAILURE);
  }
  const { buildGitHubOperationRequest, executeConnectorRuntimeRequestPlan } = await import("@clawjs/integrations");
  const operation = {
    id: connectorOperationId,
    appId: "github",
    kind: "action" as const,
    name: connectorOperationId,
    fields: [],
    authFieldNames: ["githubToken"],
  };
  const requestPlan = buildGitHubOperationRequest(operation, values as Record<string, never>);
  const response = await executeConnectorRuntimeRequestPlan({
    baseUrl,
    plan: requestPlan,
    secrets: { githubToken },
  });
  return {
    status: "submitted",
    externalUrl: externalUrlFromResponse(response.body) ?? undefined,
    response: response.body,
  };
}

function isLocalHttpBaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:")
      && ["127.0.0.1", "localhost", "::1"].includes(url.hostname);
  } catch {
    return false;
  }
}

function externalUrlFromResponse(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.html_url === "string") return record.html_url;
  if (typeof record.url === "string") return record.url;
  const discussion = (((record.data as Record<string, unknown> | undefined)?.createDiscussion as Record<string, unknown> | undefined)?.discussion) as Record<string, unknown> | undefined;
  if (typeof discussion?.url === "string") return discussion.url;
  return null;
}

function canonicalCandidate(report: ReportRecord): CanonicalCandidate | undefined {
  return report.canonicalCandidates?.find((candidate) => candidate.strength === "strong")
    ?? report.globalDedupe?.candidates.find((candidate) => candidate.strength === "strong");
}

function shouldCommentOnCanonical(report: ReportRecord): boolean {
  return report.duplicateCandidates.length > 0 || Boolean(canonicalCandidate(report));
}

function connectorOperationFor(report: ReportRecord): string {
  if (shouldCommentOnCanonical(report)) {
    const candidate = canonicalCandidate(report);
    return candidate?.source === "github_discussion" ? "external_pending.github_discussion_comment" : "github.action.create-issue-comment";
  }
  if (report.destination === "pr_proposal") return "proposal_only.no_github_mutation";
  if (report.destination === "github_issue") return "github.action.create-issue";
  if (report.destination === "github_discussion_ideas" || report.destination === "github_discussion_feedback") return "github.action.create-discussion";
  if (report.destination === "private_security_advisory") return "github.action.create-security-advisory-report";
  return "github.action.create-issue";
}

function connectorValuesFor(report: ReportRecord, flags: Record<string, string> = {}): Record<string, unknown> {
  const [owner, repo] = report.repository === "clawix" ? ["clawic", "clawix"] : ["clawic", "clawjs"];
  const values: Record<string, unknown> = {
    owner,
    repo,
    title: report.title,
    body: renderReportMarkdown(report),
    labels: report.labels,
  };
  if (report.destination === "private_security_advisory") {
    values.summary = report.title;
    values.description = renderReportMarkdown(report);
    values.severity = report.impact?.toLowerCase().includes("critical") ? "critical" : "medium";
    values.vulnerabilities = [];
    values.cweIds = ["CWE-200"];
  }
  if (report.duplicateCandidates.length > 0) {
    values.issueNumber = flags["canonical-number"] ?? flags["issue-number"] ?? "<canonical-issue-number-required>";
    values.body = renderReportMarkdown(report);
  }
  const canonical = canonicalCandidate(report);
  if (canonical?.source === "github_issue") {
    values.issueNumber = flags["canonical-number"] ?? canonical.number ?? "<canonical-issue-number-required>";
    values.body = renderReportMarkdown(report);
  }
  if (canonical?.source === "github_discussion") {
    values.canonicalDiscussionUrl = canonical.url;
    values.body = renderReportMarkdown(report);
  }
  if (report.destination === "github_discussion_ideas") values.category = "Ideas";
  if (report.destination === "github_discussion_feedback") values.category = "Feedback";
  if (report.destination === "github_discussion_ideas" || report.destination === "github_discussion_feedback") {
    values.repositoryId = flags["github-repository-id"] ?? "<github-repository-node-id-required>";
    values.categoryId = flags["discussion-category-id"] ?? flags["github-discussion-category-id"] ?? "<github-discussion-category-node-id-required>";
  }
  return values;
}

function destinationAction(destination: ReportDestination): string {
  if (destination === "github_discussion_ideas") return "create_discussion_ideas";
  if (destination === "github_discussion_feedback") return "create_discussion_feedback";
  if (destination === "private_security_advisory") return "create_private_security_advisory";
  if (destination === "pr_proposal") return "propose_pull_request_only";
  return "create_issue";
}

function nextStepsFor(report: ReportRecord): string[] {
  const steps = [`claw report preview ${report.id}`];
  if (!report.quality.ok) steps.push(`claw report check ${report.id}`);
  else steps.push(`claw report submit ${report.id} --confirm --dry-run`);
  if (report.duplicateCandidates.length > 0) steps.unshift(`claw report dedupe ${report.id}`);
  return steps;
}

function buildValidationPlan(report: ReportRecord): ReportValidationPlan {
  const safeChecks = [
    "redaction_review",
    "quality_gate",
    "local_dedupe_fingerprint",
    "connector_request_plan_dry_run",
  ];
  if (report.reproductionSteps.length > 0) safeChecks.push("reproduction_steps_review");
  if (report.version || report.platform || report.commit) safeChecks.push("environment_capture");
  const externalPending: string[] = [];
  if (report.destination === "github_discussion_ideas" || report.destination === "github_discussion_feedback") {
    externalPending.push("github_discussion_repository_and_category_node_ids");
  }
  if (report.destination === "private_security_advisory") {
    externalPending.push("github_security_advisory_permission_and_private_intake");
  }
  if (report.attachments.some((attachment) => !attachment.optIn)) {
    externalPending.push("attachment_human_opt_in");
  }
  const prohibitedChecks = [
    "real_service_write_without_confirmation",
    "paid_api_call_without_confirmation",
    "production_data_mutation",
    "public_security_disclosure",
  ];
  return { safeChecks, externalPending, prohibitedChecks };
}

function requiredApprovals(report: ReportRecord, flags: Record<string, string>): ReportApproval[] {
  return [
    {
      id: `approval_cli_${report.id}`,
      surface: "cli_preview",
      status: "required",
      actor: flags["github-user"] ?? flags.user ?? "user",
      reason: "CLI preview must be reviewed before publication.",
    },
    {
      id: `approval_host_${report.id}`,
      surface: "signed_host",
      status: flags["host-approval-id"] ? "approved" : "external_pending",
      actor: flags["github-user"] ?? flags.user ?? "user",
      ...(flags["host-approval-id"] ? { hostApprovalId: flags["host-approval-id"], approvedAt: nowIso() } : { reason: "Signed host approval is required when available." }),
    },
  ];
}

function approvedApprovals(report: ReportRecord, flags: Record<string, string>): ReportApproval[] {
  const actor = flags["github-user"] ?? flags.user ?? "user";
  const now = nowIso();
  return [
    {
      id: `approval_cli_${report.id}`,
      surface: "cli_preview",
      status: "approved",
      actor,
      approvedAt: now,
      reason: "User confirmed the CLI preview.",
    },
    {
      id: `approval_host_${report.id}`,
      surface: "signed_host",
      status: flags["host-approval-id"] ? "approved" : "external_pending",
      actor,
      ...(flags["host-approval-id"] ? { hostApprovalId: flags["host-approval-id"], approvedAt: now } : { reason: "Host approval unavailable in local-only dry-run path." }),
    },
  ];
}

function approvalSurface(report: ReportRecord, flags: Record<string, string>, cliConfirmed: boolean): Record<string, unknown> {
  return {
    cliPreview: cliConfirmed ? "approved" : "required",
    signedHost: flags["host-approval-id"] ? "approved" : "external_pending",
    hostApprovalId: flags["host-approval-id"] ?? null,
    audit: {
      reportId: report.id,
      actor: flags["github-user"] ?? flags.user ?? "user",
      action: "github_report_submission",
      dryRunOnlyUnlessConnectorExecutes: true,
    },
  };
}

function publicationIdentity(flags: Record<string, string>): Record<string, unknown> {
  return {
    mode: "user_github_account",
    githubUser: flags["github-user"] ?? flags.user ?? null,
    tokenSecretField: "githubToken",
    broker: "claw-secret-broker",
    status: flags["github-user"] || flags.user ? "declared" : "required_before_live_submit",
  };
}

function triageRecommendation(report: ReportRecord): Record<string, unknown> {
  const recommendedAction = !report.quality.ok
    ? "request_more_info"
    : shouldCommentOnCanonical(report)
      ? "comment_on_canonical"
      : report.destination === "github_discussion_ideas" || report.destination === "github_discussion_feedback"
        ? "route_to_canonical_discussion"
        : "ready_for_human_review";
  return {
    reportId: report.id,
    title: report.title,
    status: report.status,
    destination: report.destination,
    score: report.quality.score,
    recommendedAction,
    labelRecommendations: report.labels,
    missing: report.quality.missing,
    duplicateCandidates: report.duplicateCandidates,
    suggestedComment: suggestedTriageComment(report, recommendedAction),
    destructiveActionsAllowed: false,
  };
}

function suggestedTriageComment(report: ReportRecord, recommendedAction: string): string {
  if (recommendedAction === "request_more_info") {
    return `Needs more evidence before publication: ${report.quality.missing.join(", ") || "unspecified"}.`;
  }
  if (recommendedAction === "comment_on_canonical") {
    return `Likely duplicate of ${report.duplicateCandidates[0]?.reportId}; add this sanitized evidence to the canonical thread after approval.`;
  }
  return `Suggested labels: ${report.labels.join(", ")}.`;
}

function readReportState(workspaceRoot: string): ReportGovernanceState {
  const file = reportStatePath(workspaceRoot);
  if (!fs.existsSync(file)) {
    const now = nowIso();
    return { schemaVersion: 1, fingerprintSalt: randomBytes(24).toString("hex"), createdAt: now, updatedAt: now, reports: [], budgetEvents: [], budgetOverrides: [] };
  }
  try {
    return normalizeReportState(JSON.parse(fs.readFileSync(file, "utf8")));
  } catch (error) {
    if (error instanceof CliHandledError) throw error;
    throw new CliHandledError("invalid_report_state_json", `Report governance state must contain valid JSON: ${file}`, CLI_EXIT_USAGE);
  }
}

function writeReportState(workspaceRoot: string, state: ReportGovernanceState): void {
  const file = reportStatePath(workspaceRoot);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(normalizeReportState(state), null, 2)}\n`);
}

function reportStatePath(workspaceRoot: string): string {
  return resolveClawPersistentSurfacePath("claw.workspace.reports.governance_state", workspaceRoot);
}

function reportId(): string {
  return `rep_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeReportState(value: unknown): ReportGovernanceState {
  if (!value || typeof value !== "object") throw new CliHandledError("invalid_state", "Invalid report governance state.");
  const state = value as Partial<ReportGovernanceState>;
  return {
    schemaVersion: 1,
    fingerprintSalt: typeof state.fingerprintSalt === "string" && state.fingerprintSalt.length >= 16 ? state.fingerprintSalt : randomBytes(24).toString("hex"),
    createdAt: typeof state.createdAt === "string" ? state.createdAt : nowIso(),
    updatedAt: typeof state.updatedAt === "string" ? state.updatedAt : nowIso(),
    reports: Array.isArray(state.reports) ? state.reports.map((report) => normalizeReportRecord(report)) : [],
    budgetEvents: Array.isArray(state.budgetEvents) ? state.budgetEvents : [],
    budgetOverrides: Array.isArray(state.budgetOverrides) ? state.budgetOverrides : [],
  };
}

function normalizeReportRecord(value: unknown): ReportRecord {
  if (!value || typeof value !== "object") throw new CliHandledError("invalid_report", "Invalid report record.");
  const report = value as ReportRecord;
  return {
    ...report,
    schemaVersion: 1,
    id: String(report.id || reportId()),
    kind: isReportKind(report.kind) ? report.kind : "bug",
    status: isReportStatus(report.status) ? report.status : "draft",
    destination: isReportDestination(report.destination) ? report.destination : "github_issue",
    repository: report.repository === "clawix" ? "clawix" : "clawjs",
    title: String(report.title || "Report"),
    summary: String(report.summary || report.title || "Report"),
    reproductionSteps: Array.isArray(report.reproductionSteps) ? report.reproductionSteps.map(String) : [],
    evidence: Array.isArray(report.evidence) ? report.evidence : [],
    attachments: Array.isArray(report.attachments) ? report.attachments : [],
    labels: Array.isArray(report.labels) ? report.labels.map(String) : [],
    fingerprint: String(report.fingerprint || ""),
    quality: report.quality ?? emptyQuality(),
    privacy: report.privacy ?? { ok: true, redactedCount: 0, blockedPublic: false, blockedReasons: [], attachmentOptInRequired: false },
    duplicateCandidates: Array.isArray(report.duplicateCandidates) ? report.duplicateCandidates : [],
    ...(Array.isArray(report.canonicalCandidates) ? { canonicalCandidates: report.canonicalCandidates } : {}),
    ...(report.globalDedupe ? { globalDedupe: report.globalDedupe } : {}),
    ...(report.budgetState ? { budgetState: report.budgetState } : {}),
    ...(report.retention ? { retention: report.retention } : { retention: { policy: "manual_prune", exportRedactedByDefault: true, deleteRequiresConfirmation: true } }),
    ...(report.prProposal ? { prProposal: report.prProposal } : {}),
    approvals: Array.isArray(report.approvals) ? report.approvals : [],
    receipts: Array.isArray(report.receipts) ? report.receipts : [],
    ...(report.validationPlan ? { validationPlan: report.validationPlan } : {}),
    createdByAgentId: String(report.createdByAgentId || "agent"),
    createdAt: String(report.createdAt || nowIso()),
    updatedAt: String(report.updatedAt || nowIso()),
    notes: Array.isArray(report.notes) ? report.notes.map(String) : [],
  };
}

function isReportKind(value: unknown): value is ReportKind {
  return typeof value === "string" && REPORT_KINDS.includes(value as ReportKind);
}

function isReportStatus(value: unknown): value is ReportStatus {
  return typeof value === "string" && REPORT_STATUSES.includes(value as ReportStatus);
}

function isReportDestination(value: unknown): value is ReportDestination {
  return typeof value === "string" && REPORT_DESTINATIONS.includes(value as ReportDestination);
}

function validateReportRepositoryFlag(value: string | undefined): void {
  if (!value || value === "clawjs" || value === "clawix") return;
  throw new CliHandledError("invalid_report_repo", `Invalid report repository: ${value}. Expected clawjs or clawix.`, CLI_EXIT_USAGE);
}

function validateReportKindFlag(value: string | undefined): void {
  if (!value || isReportKind(value)) return;
  throw new CliHandledError("invalid_report_kind", `Invalid report kind: ${value}. Expected one of: ${REPORT_KINDS.join(", ")}.`, CLI_EXIT_USAGE);
}

function validateReportDestinationFlag(value: string | undefined): void {
  if (!value || isReportDestination(value)) return;
  throw new CliHandledError("invalid_report_destination", `Invalid report destination: ${value}. Expected one of: ${REPORT_DESTINATIONS.join(", ")}.`, CLI_EXIT_USAGE);
}

function writeUsage(context: CliContext, binName: string): void {
  context.stdout.write(`Usage: ${binName} report draft|bug|feature|translation|security|check|dedupe|preview|submit|status|triage|templates|github|export|delete|prune|budget\n`);
}

function writeReportResult(context: CliContext, wantsJson: boolean, action: string, data: unknown, exitCode = CLI_EXIT_OK): number {
  if (wantsJson) {
    writeCommandJsonOk(context.stdout, "report", data, { action });
  } else if (action === "preview" && typeof data === "object" && data && "markdown" in data) {
    context.stdout.write(String((data as { markdown: string }).markdown));
  } else {
    context.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
  }
  return exitCode;
}
