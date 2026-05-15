import { CLI_EXIT_DEGRADED } from "./cli-errors.ts";
import {
  buildBootstrapPlan,
  buildGlobalDedupeQuery,
  candidatesFromGitHubSearch,
  externalPendingGlobalDedupe,
  mergeGlobalDedupe,
  parseCsv,
  reportBudgetState,
} from "./cli-report-governance.ts";
import { readBooleanFlag } from "./cli-flag-parsers.ts";
import { writeCommandJsonOk } from "./cli-json.ts";

type CliContext = {
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
  cwd: string;
};

type ReportLike = {
  id: string;
  repository: "clawjs" | "clawix";
  title: string;
  component?: string;
  locale?: string;
  createdByAgentId: string;
  fingerprint: string;
  globalDedupe?: unknown;
  canonicalCandidates?: unknown[];
};

type StateLike = {
  updatedAt: string;
  reports: ReportLike[];
  budgetEvents: unknown[];
  budgetOverrides: unknown[];
};

export async function refreshGlobalDedupe(report: ReportLike, flags: Record<string, string>, nowIso: () => string): Promise<void> {
  const baseUrl = flags["github-base-url"];
  if (!baseUrl) {
    report.globalDedupe = externalPendingGlobalDedupe(report, "github_connector_search_not_configured");
    return;
  }
  if (!isLocalHttpBaseUrl(baseUrl)) {
    report.globalDedupe = externalPendingGlobalDedupe(report, "real_github_search_requires_explicit_external_validation");
    return;
  }
  const tokenEnv = flags["github-token-env"] ?? "CLAW_REPORT_GITHUB_TOKEN";
  const githubToken = process.env[tokenEnv];
  if (!githubToken) {
    report.globalDedupe = externalPendingGlobalDedupe(report, `missing_github_token_env:${tokenEnv}`);
    return;
  }
  const [owner, repo] = report.repository === "clawix" ? ["clawic", "clawix"] : ["clawic", "clawjs"];
  const query = buildGlobalDedupeQuery(report);
  const { buildGitHubOperationRequest, executeConnectorRuntimeRequestPlan } = await import("@clawjs/integrations");
  const operation = (id: string) => ({ id, appId: "github", kind: "action" as const, name: id, fields: [], authFieldNames: ["githubToken"] });
  const issuePlan = buildGitHubOperationRequest(operation("github.action.search-issues"), { q: `${query} type:issue`, perPage: 5 } as Record<string, never>);
  const discussionPlan = buildGitHubOperationRequest(operation("github.action.search-discussions"), { owner, repo, query, first: 5 } as Record<string, never>);
  const [issues, discussions] = await Promise.all([
    executeConnectorRuntimeRequestPlan({ baseUrl, plan: issuePlan, secrets: { githubToken } }),
    executeConnectorRuntimeRequestPlan({ baseUrl, plan: discussionPlan, secrets: { githubToken } }),
  ]);
  const candidates = candidatesFromGitHubSearch(report, issues.body, discussions.body);
  report.canonicalCandidates = candidates;
  report.globalDedupe = mergeGlobalDedupe(report, candidates, nowIso());
}

export async function runGitHubBootstrap(input: {
  state: StateLike;
  flags: Record<string, string>;
  argv: string[];
  context: CliContext;
  wantsJson: boolean;
  save: () => void;
  reportLabels: Record<string, readonly string[]>;
  nowIso: () => string;
}): Promise<number> {
  const existingLabels = parseCsv(input.flags["existing-labels"]);
  const plan = buildBootstrapPlan(existingLabels, input.reportLabels);
  const apply = readBooleanFlag(input.argv, input.flags, "apply", false);
  const confirmed = readBooleanFlag(input.argv, input.flags, "confirm", false);
  if (!apply) return writeResult(input.context, input.wantsJson, "github.bootstrap", { dryRun: true, plan });
  if (!confirmed) return writeResult(input.context, input.wantsJson, "github.bootstrap", { applied: false, confirmationRequired: true, plan }, CLI_EXIT_DEGRADED);
  const baseUrl = input.flags["github-base-url"];
  const tokenEnv = input.flags["github-token-env"] ?? "CLAW_REPORT_GITHUB_TOKEN";
  const githubToken = process.env[tokenEnv];
  if (!baseUrl || !isLocalHttpBaseUrl(baseUrl) || !githubToken) {
    return writeResult(input.context, input.wantsJson, "github.bootstrap", {
      applied: false,
      externalPending: ["github_label_apply_requires_local_test_connector_or_explicit_real_integration"],
      plan,
    }, CLI_EXIT_DEGRADED);
  }
  const [owner, repo] = input.flags.repo === "clawix" ? ["clawic", "clawix"] : ["clawic", "clawjs"];
  const missingLabels = (plan as { missingLabels: string[] }).missingLabels;
  const { buildGitHubOperationRequest, executeConnectorRuntimeRequestPlan } = await import("@clawjs/integrations");
  const operation = { id: "github.action.create-label", appId: "github", kind: "action" as const, name: "github.action.create-label", fields: [], authFieldNames: ["githubToken"] };
  const results = [];
  for (const label of missingLabels) {
    const requestPlan = buildGitHubOperationRequest(operation, { owner, repo, name: label, color: "ededed", description: "Claw report governance label" } as Record<string, never>);
    results.push(await executeConnectorRuntimeRequestPlan({ baseUrl, plan: requestPlan, secrets: { githubToken } }));
  }
  input.state.updatedAt = input.nowIso();
  input.save();
  return writeResult(input.context, input.wantsJson, "github.bootstrap", {
    applied: true,
    appliedLabels: missingLabels,
    externalPending: (plan as { externalPending: string[] }).externalPending,
    results: results.map((result) => result.body),
  });
}

export function runBudgetCommand(input: {
  state: StateLike;
  subcommand: string | undefined;
  flags: Record<string, string>;
  argv: string[];
  context: CliContext;
  wantsJson: boolean;
  save: () => void;
  nowIso: () => string;
}): number {
  const now = input.nowIso();
  if (input.subcommand === "reset") {
    if (!readBooleanFlag(input.argv, input.flags, "confirm", false)) return writeResult(input.context, input.wantsJson, "budget", { reset: false, confirmationRequired: true }, CLI_EXIT_DEGRADED);
    input.state.budgetEvents = [];
    input.state.budgetOverrides = [];
    input.state.updatedAt = now;
    input.save();
    return writeResult(input.context, input.wantsJson, "budget", { reset: true });
  }
  if (input.subcommand === "override") {
    const repository = input.flags.repo === "clawix" ? "clawix" : "clawjs";
    const override = {
      id: `budget_override_${Date.now().toString(36)}`,
      agentId: input.flags.agent ?? input.flags["agent-id"] ?? "agent",
      repository,
      createdAt: now,
      reason: input.flags.reason ?? "human_override",
    };
    input.state.budgetOverrides.unshift(override);
    input.state.budgetEvents.unshift({ ...override, action: "override" as const });
    input.state.updatedAt = now;
    input.save();
    return writeResult(input.context, input.wantsJson, "budget", { override });
  }
  return writeResult(input.context, input.wantsJson, "budget", budgetSummary(input.state, now));
}

export function budgetSummary(state: StateLike, now: string): Record<string, unknown> {
  const reports = state.reports.slice(0, 10).map((report) => reportBudgetState(state, report, "publish_prompt", now));
  return {
    limits: reports[0]?.limits ?? {
      draftsPerDay: 20,
      publishPromptsPerHour: 5,
      dryRunSubmitsPerHour: 3,
      duplicateCooldownHours: 24,
    },
    activeOverrides: state.budgetOverrides,
    recentEvents: state.budgetEvents.slice(0, 20),
    sampledReports: reports,
  };
}

function isLocalHttpBaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && ["127.0.0.1", "localhost", "::1"].includes(url.hostname);
  } catch {
    return false;
  }
}

function writeResult(context: CliContext, wantsJson: boolean, action: string, data: unknown, exitCode = 0): number {
  if (wantsJson) writeCommandJsonOk(context.stdout, "report", data, { action });
  else context.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
  return exitCode;
}
