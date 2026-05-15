import path from "node:path";

export type ReportLike = {
  id: string;
  kind: string;
  status: string;
  destination: string;
  repository: "clawjs" | "clawix";
  title: string;
  summary: string;
  component?: string;
  locale?: string;
  observed?: string;
  expected?: string;
  impact?: string;
  frequency?: string;
  fingerprint: string;
  labels: string[];
  attachments: Array<{ id: string; name: string; kind: string; optIn: boolean }>;
  createdByAgentId: string;
  createdAt: string;
  updatedAt: string;
  canonicalCandidates?: CanonicalCandidate[];
  globalDedupe?: GlobalDedupeState;
  budgetState?: ReportBudgetState;
  retention?: ReportRetention;
  prProposal?: ReportPrProposal;
};

export type CanonicalCandidate = {
  source: "github_issue" | "github_discussion";
  id: string;
  number?: number;
  title: string;
  url: string;
  state?: string;
  similarity: number;
  strength: "strong" | "medium" | "weak";
};

export type GlobalDedupeState = {
  status: "not_checked" | "checked" | "external_pending" | "review_required";
  checkedAt?: string;
  connector: "claw-github";
  query: string;
  candidates: CanonicalCandidate[];
  recommendedAction: "create_new_thread" | "comment_on_canonical" | "review_candidates";
  externalPending: string[];
};

export type ReportPrProposal = {
  problem: string;
  suspectedFiles: string[];
  patchPlan: string[];
  tests: string[];
  risks: string[];
  opensPullRequest: false;
};

export type ReportRetention = {
  policy: "manual_prune";
  exportRedactedByDefault: true;
  deleteRequiresConfirmation: true;
  lastExportedAt?: string;
  deletedAt?: string;
};

export type ReportBudgetEvent = {
  id: string;
  action: "draft" | "publish_prompt" | "dry_run_submit" | "override";
  reportId?: string;
  agentId: string;
  repository: "clawjs" | "clawix";
  fingerprint?: string;
  createdAt: string;
  reason?: string;
};

export type ReportBudgetOverride = {
  id: string;
  agentId: string;
  repository: "clawjs" | "clawix";
  createdAt: string;
  reason: string;
};

export type ReportBudgetState = {
  status: "ok" | "limited" | "override_active";
  agentId: string;
  repository: "clawjs" | "clawix";
  limits: {
    draftsPerDay: number;
    publishPromptsPerHour: number;
    dryRunSubmitsPerHour: number;
    duplicateCooldownHours: number;
  };
  usage: {
    draftsToday: number;
    publishPromptsThisHour: number;
    dryRunSubmitsThisHour: number;
  };
  cooldownActive: boolean;
  blockers: string[];
  overrideId?: string;
};

export type ReportGovernanceStateLike = {
  budgetEvents?: ReportBudgetEvent[];
  budgetOverrides?: ReportBudgetOverride[];
  reports: ReportLike[];
};

export const REPORT_BUDGET_LIMITS = {
  draftsPerDay: 20,
  publishPromptsPerHour: 5,
  dryRunSubmitsPerHour: 3,
  duplicateCooldownHours: 24,
} as const;

const STRONG_THRESHOLD = 0.82;
const MEDIUM_THRESHOLD = 0.55;

export function inferFineReportDestination(kind: string, flags: Record<string, string>, title: string, observed?: string): string | null {
  if (kind === "translation" && isBroadSignal(`${title} ${observed ?? ""} ${flags.scope ?? ""} ${flags.broad ?? ""}`)) return "github_discussion_feedback";
  if (kind === "ux_feedback") return "github_discussion_feedback";
  if (kind === "feature") return "github_discussion_ideas";
  return null;
}

export function isBroadSignal(value: string): boolean {
  const text = value.toLowerCase();
  return [
    "entire language",
    "whole language",
    "all translations",
    "bad in general",
    "idioma entero",
    "traducción entera",
    "toda la traducción",
    "visual",
    "icons",
    "iconos",
    "settings feels",
  ].some((needle) => text.includes(needle));
}

export function buildPrProposal(report: ReportLike, flags: Record<string, string>): ReportPrProposal | undefined {
  if (report.destination !== "pr_proposal") return undefined;
  return {
    problem: report.observed ?? report.summary,
    suspectedFiles: parseCsv(flags.files ?? flags.file ?? flags.paths).map((entry) => path.posix.normalize(entry).replace(/^(\.\.\/)+/, "")),
    patchPlan: parseCsv(flags["patch-plan"] ?? flags.plan ?? "Inspect the affected code path; prepare a minimal patch; keep report publication separate from PR creation."),
    tests: parseCsv(flags.tests ?? "Add or update a focused regression test; run the nearest package test."),
    risks: parseCsv(flags.risks ?? "Wrong affected file; incomplete reproduction; patch may need maintainer review."),
    opensPullRequest: false,
  };
}

export function buildGlobalDedupeQuery(report: ReportLike): string {
  const repo = report.repository === "clawix" ? "clawic/clawix" : "clawic/clawjs";
  const terms = normalizeSearchText(`${report.title} ${report.component ?? ""} ${report.locale ?? ""}`).split(" ").slice(0, 8).join(" ");
  return `repo:${repo} ${terms}`;
}

export function mergeGlobalDedupe(report: ReportLike, candidates: CanonicalCandidate[], now: string): GlobalDedupeState {
  const strong = candidates.some((candidate) => candidate.strength === "strong");
  const medium = candidates.some((candidate) => candidate.strength === "medium");
  return {
    status: strong || !medium ? "checked" : "review_required",
    checkedAt: now,
    connector: "claw-github",
    query: buildGlobalDedupeQuery(report),
    candidates,
    recommendedAction: strong ? "comment_on_canonical" : medium ? "review_candidates" : "create_new_thread",
    externalPending: [],
  };
}

export function externalPendingGlobalDedupe(report: ReportLike, reason: string): GlobalDedupeState {
  return {
    status: "external_pending",
    connector: "claw-github",
    query: buildGlobalDedupeQuery(report),
    candidates: [],
    recommendedAction: "create_new_thread",
    externalPending: [reason],
  };
}

export function candidatesFromGitHubSearch(report: ReportLike, issues: unknown, discussions: unknown): CanonicalCandidate[] {
  const issueItems = Array.isArray((issues as { items?: unknown[] } | null)?.items) ? (issues as { items: unknown[] }).items : [];
  const discussionNodes = (((discussions as { data?: { search?: { nodes?: unknown[] } } } | null)?.data?.search?.nodes) ?? []);
  return [
    ...issueItems.map((item) => candidateFromItem(report, item, "github_issue")),
    ...discussionNodes.map((item) => candidateFromItem(report, item, "github_discussion")),
  ]
    .filter((candidate): candidate is CanonicalCandidate => Boolean(candidate))
    .sort((left, right) => right.similarity - left.similarity)
    .slice(0, 5);
}

function candidateFromItem(report: ReportLike, item: unknown, source: CanonicalCandidate["source"]): CanonicalCandidate | null {
  if (!item || typeof item !== "object") return null;
  const record = item as Record<string, unknown>;
  const title = typeof record.title === "string" ? record.title : "";
  const url = typeof record.html_url === "string" ? record.html_url : typeof record.url === "string" ? record.url : "";
  if (!title || !url) return null;
  const similarity = titleSimilarity(report.title, title);
  if (similarity < MEDIUM_THRESHOLD) return null;
  return {
    source,
    id: String(record.id ?? record.node_id ?? url),
    number: typeof record.number === "number" ? record.number : undefined,
    title,
    url,
    state: typeof record.state === "string" ? record.state : undefined,
    similarity,
    strength: similarity >= STRONG_THRESHOLD ? "strong" : "medium",
  };
}

export function titleSimilarity(left: string, right: string): number {
  const leftTokens = new Set(normalizeSearchText(left).split(" ").filter(Boolean));
  const rightTokens = new Set(normalizeSearchText(right).split(" ").filter(Boolean));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  const overlap = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return overlap / Math.max(leftTokens.size, rightTokens.size);
}

export function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ").filter((part) => part.length > 2).join(" ");
}

export function reportBudgetState(state: ReportGovernanceStateLike, report: Pick<ReportLike, "id" | "createdByAgentId" | "repository" | "fingerprint">, action: "draft" | "publish_prompt" | "dry_run_submit", now: string): ReportBudgetState {
  const events = state.budgetEvents ?? [];
  const overrides = state.budgetOverrides ?? [];
  const agentId = report.createdByAgentId;
  const repository = report.repository;
  const dayAgo = Date.parse(now) - 24 * 60 * 60 * 1000;
  const hourAgo = Date.parse(now) - 60 * 60 * 1000;
  const matching = events.filter((event) => event.agentId === agentId && event.repository === repository);
  const usage = {
    draftsToday: matching.filter((event) => event.action === "draft" && Date.parse(event.createdAt) >= dayAgo).length,
    publishPromptsThisHour: matching.filter((event) => event.action === "publish_prompt" && Date.parse(event.createdAt) >= hourAgo).length,
    dryRunSubmitsThisHour: matching.filter((event) => event.action === "dry_run_submit" && Date.parse(event.createdAt) >= hourAgo).length,
  };
  const cooldownAgo = Date.parse(now) - REPORT_BUDGET_LIMITS.duplicateCooldownHours * 60 * 60 * 1000;
  const cooldownActive = Boolean(report.fingerprint && matching.some((event) => event.reportId !== report.id && event.fingerprint === report.fingerprint && Date.parse(event.createdAt) >= cooldownAgo));
  const blockers: string[] = [];
  if (action === "draft" && usage.draftsToday >= REPORT_BUDGET_LIMITS.draftsPerDay) blockers.push("drafts_per_day_exceeded");
  if (action === "publish_prompt" && usage.publishPromptsThisHour >= REPORT_BUDGET_LIMITS.publishPromptsPerHour) blockers.push("publish_prompts_per_hour_exceeded");
  if (action === "dry_run_submit" && usage.dryRunSubmitsThisHour >= REPORT_BUDGET_LIMITS.dryRunSubmitsPerHour) blockers.push("dry_run_submits_per_hour_exceeded");
  const canonicalPath = Array.isArray((report as { duplicateCandidates?: unknown[] }).duplicateCandidates)
    && ((report as { duplicateCandidates?: unknown[] }).duplicateCandidates?.length ?? 0) > 0;
  if (action !== "draft" && cooldownActive && !canonicalPath) blockers.push("duplicate_cooldown_active");
  const override = overrides.find((entry) => entry.agentId === agentId && entry.repository === repository);
  return {
    status: override ? "override_active" : blockers.length > 0 ? "limited" : "ok",
    agentId,
    repository,
    limits: REPORT_BUDGET_LIMITS,
    usage,
    cooldownActive,
    blockers: override ? [] : blockers,
    ...(override ? { overrideId: override.id } : {}),
  };
}

export function recordBudgetEvent(state: ReportGovernanceStateLike, report: Pick<ReportLike, "id" | "createdByAgentId" | "repository" | "fingerprint">, action: ReportBudgetEvent["action"], now: string, reason?: string): ReportBudgetEvent {
  const event = {
    id: `budget_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 8)}`,
    action,
    reportId: report.id,
    agentId: report.createdByAgentId,
    repository: report.repository,
    fingerprint: report.fingerprint,
    createdAt: now,
    ...(reason ? { reason } : {}),
  };
  state.budgetEvents = [event, ...(state.budgetEvents ?? [])].slice(0, 500);
  return event;
}

export function buildBootstrapPlan(existingLabels: string[], labelGroups: Record<string, readonly string[]>): Record<string, unknown> {
  const requiredLabels = Object.values(labelGroups).flat();
  const missingLabels = requiredLabels.filter((label) => !existingLabels.includes(label));
  return {
    requiredLabels,
    missingLabels,
    templates: ["agent_report.yml", "translation_report.yml", "PULL_REQUEST_TEMPLATE.md"],
    discussionCategories: ["Ideas", "Feedback"],
    privateSecurity: "required",
    canApply: ["missing_labels"],
    externalPending: ["discussion_category_creation", "security_advisory_repository_setting", "template_file_installation"],
  };
}

export function exportReportPackage(report: ReportLike, includeAttachments: string[], now: string): Record<string, unknown> {
  const allowed = new Set(includeAttachments);
  return {
    exportedAt: now,
    redacted: true,
    report: {
      ...report,
      attachments: report.attachments.filter((attachment) => attachment.optIn && allowed.has(attachment.name)),
    },
    omittedAttachments: report.attachments.filter((attachment) => !attachment.optIn || !allowed.has(attachment.name)).map((attachment) => attachment.name),
  };
}

export function parseOlderThan(value: string | undefined): number | null {
  if (!value) return null;
  const match = value.match(/^(\d+)(d|h)$/);
  if (!match) return null;
  const amount = Number(match[1]);
  return amount * (match[2] === "d" ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000);
}

export function pruneCandidates(reports: ReportLike[], flags: Record<string, string>, now: string): ReportLike[] {
  const olderThan = parseOlderThan(flags["older-than"]);
  const statuses = new Set(parseCsv(flags.status));
  const kinds = new Set(parseCsv(flags.kind));
  const repos = new Set(parseCsv(flags.repo));
  return reports.filter((report) => {
    if (statuses.size > 0 && !statuses.has(report.status)) return false;
    if (kinds.size > 0 && !kinds.has(report.kind)) return false;
    if (repos.size > 0 && !repos.has(report.repository)) return false;
    if (olderThan !== null && Date.parse(report.updatedAt) > Date.parse(now) - olderThan) return false;
    return true;
  });
}

export function parseCsv(value: string | undefined): string[] {
  return (value ?? "").split(",").map((part) => part.trim()).filter(Boolean);
}
