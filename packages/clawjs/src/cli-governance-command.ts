import fs from "fs";
import path from "path";

import { buildClawDebtLedger, type ClawDebtLedgerEntry, type ClawDebtLedgerRepositoryRoot } from "@clawjs/core";

import { CLI_EXIT_OK, CLI_EXIT_USAGE, CliHandledError } from "./cli-errors.ts";
import { formatCliTable } from "./cli-flag-parsers.ts";
import { writeJsonOk } from "./cli-json.ts";

type GovernanceDoctorRepo = ClawDebtLedgerRepositoryRoot & {
  detectedBy: "root" | "ancestor" | "sibling" | "fallback";
};

type GovernanceDoctorInput = {
  positionals: string[];
  flags: Record<string, string>;
  context: {
    stdout: NodeJS.WritableStream;
    stderr: NodeJS.WritableStream;
    cwd: string;
  };
  wantsJson: boolean;
  binName: string;
};

type GovernanceDoctorRead = {
  repo: string;
  path: string;
  reason: string;
  priority: "required" | "recommended" | "conditional";
};

type GovernanceDoctorSkill = {
  repo: string;
  id: string;
  path: string;
  reason: string;
  priority: "required" | "recommended" | "conditional";
};

type GovernanceDoctorCheck = {
  repo: string;
  group: "focused" | "docs" | "policy" | "host" | "full";
  command: string;
  cwd: string;
  requirement: "local_only" | "host_required" | "external_pending";
  reason: string;
};

type GovernanceDoctorExternalPending = {
  repo: string;
  id: string;
  path: string;
  summary: string;
  blocker: boolean;
  validation: string;
};

type GovernanceDoctorStaleDoc = {
  repo: string;
  path: string;
  status: "known_stale" | "stale_risk" | "needs_check";
  guard: string;
  reason: string;
};

export async function runGovernanceCli(input: GovernanceDoctorInput): Promise<number> {
  const action = input.positionals[1] || "doctor";
  if (action === "doctor") return runGovernanceDoctor(input);
  if (action === "help" || input.flags.help === "true") return writeGovernanceUsage(input);
  throw new CliHandledError("unknown_governance_command", `Usage: ${input.binName} governance doctor --json`, CLI_EXIT_USAGE);
}

function runGovernanceDoctor(input: GovernanceDoctorInput): number {
  const repositories = detectGovernanceRepositories(input.flags.root || input.context.cwd);
  const ledger = buildClawDebtLedger({
    rootDir: repositories[0]?.rootDir ?? input.context.cwd,
    generatedAt: input.flags.now,
    repositories,
  });
  const payload = {
    schemaVersion: 1,
    scope: {
      mode: "plan-only",
      cwd: path.resolve(input.context.cwd),
      root: path.resolve(input.flags.root || repositories[0]?.rootDir || input.context.cwd),
      repositories: repositories.map((repo) => ({
        repo: repo.repo,
        rootDir: repo.rootDir,
        detectedBy: repo.detectedBy,
      })),
      crossRepo: repositories.length > 1,
    },
    reads: buildReads(repositories),
    skills: buildSkills(repositories),
    checks: buildChecks(repositories, input.binName),
    externalPending: buildExternalPending(ledger.entries, repositories),
    staleDocs: buildStaleDocs(ledger.entries, ledger.audit.expiredEntries, ledger.audit.unindexedCandidates, repositories),
  };

  if (input.wantsJson) {
    writeJsonOk(input.context.stdout, payload, {
      schemaVersion: "claw.governance.doctor.v1" as never,
      command: "governance doctor",
      canonicalCommand: "governance",
      jsonSchemaId: "claw.cli.governance.v1",
      mode: "plan-only",
    });
    return CLI_EXIT_OK;
  }

  input.context.stdout.write(`${formatCliTable([
    { section: "reads", count: String(payload.reads.length) },
    { section: "skills", count: String(payload.skills.length) },
    { section: "checks", count: String(payload.checks.length) },
    { section: "externalPending", count: String(payload.externalPending.length) },
    { section: "staleDocs", count: String(payload.staleDocs.length) },
  ])}\n`);
  return CLI_EXIT_OK;
}

function writeGovernanceUsage(input: GovernanceDoctorInput): number {
  input.context.stderr.write([
    `Usage: ${input.binName} governance doctor --json [--root PATH]`,
    "",
    "Returns a read-only governance routing report: reads, skills, checks, external pending lanes, and stale-doc risks.",
  ].join("\n") + "\n");
  return CLI_EXIT_USAGE;
}

function detectGovernanceRepositories(startDir: string): GovernanceDoctorRepo[] {
  const start = path.resolve(startDir);
  const clawjsRoot = findAncestor(start, isClawjsRoot);
  const clawixRoot = findAncestor(start, isClawixRoot);
  const repositories: GovernanceDoctorRepo[] = [];

  if (clawjsRoot) {
    repositories.push({ repo: "clawjs", rootDir: clawjsRoot, detectedBy: clawjsRoot === start ? "root" : "ancestor" });
    const siblingClawix = path.resolve(clawjsRoot, "../Clawix/clawix");
    if (isClawixRoot(siblingClawix)) repositories.push({ repo: "clawix", rootDir: siblingClawix, detectedBy: "sibling" });
  } else if (clawixRoot) {
    const siblingClawjs = path.resolve(clawixRoot, "../../../clawjs");
    if (isClawjsRoot(siblingClawjs)) repositories.push({ repo: "clawjs", rootDir: siblingClawjs, detectedBy: "sibling" });
    repositories.push({ repo: "clawix", rootDir: clawixRoot, detectedBy: clawixRoot === start ? "root" : "ancestor" });
  }

  if (repositories.length === 0) {
    repositories.push({
      repo: inferRepoName(start),
      rootDir: start,
      detectedBy: "fallback",
    });
  }

  return [...new Map(repositories.map((repo) => [`${repo.repo}:${repo.rootDir}`, repo])).values()];
}

function findAncestor(startDir: string, predicate: (candidate: string) => boolean): string | null {
  let current = path.resolve(startDir);
  while (true) {
    if (predicate(current)) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function isClawjsRoot(candidate: string): boolean {
  return fs.existsSync(path.join(candidate, "package.json"))
    && fs.existsSync(path.join(candidate, "packages", "clawjs-core"))
    && fs.existsSync(path.join(candidate, "docs", "decision-map.md"));
}

function isClawixRoot(candidate: string): boolean {
  return fs.existsSync(path.join(candidate, "AGENTS.md"))
    && fs.existsSync(path.join(candidate, "docs", "decision-map.md"))
    && (fs.existsSync(path.join(candidate, "macos")) || fs.existsSync(path.join(candidate, "STYLE.md")) || path.basename(candidate).toLowerCase() === "clawix");
}

function inferRepoName(rootDir: string): string {
  const base = path.basename(rootDir).toLowerCase();
  if (base === "clawix") return "clawix";
  if (base === "clawjs") return "clawjs";
  return base || "workspace";
}

function buildReads(repositories: GovernanceDoctorRepo[]): GovernanceDoctorRead[] {
  const reads: GovernanceDoctorRead[] = [];
  for (const repo of repositories) {
    addRead(reads, repo, "AGENTS.md", "Agent entrypoint and red lines.", "required");
    addRead(reads, repo, "docs/decision-map.md", "Decision-to-canon-to-check router.", "required");
    addRead(reads, repo, "docs/discoverability.registry.json", "Machine-readable discoverability routes.", "recommended");
    addRead(reads, repo, "docs/agent-rules/index.md", "Expanded operating rules outside always-loaded instructions.", "recommended");
    addRead(reads, repo, "CONSTITUTION.md", "Highest authority for major architecture/product/security decisions.", "conditional");
    addRead(reads, repo, "../CONSTITUTION.md", "Shared Clawix/ClawJS constitution when invoked from Clawix.", "conditional");

    if (repo.repo === "clawjs") {
      addRead(reads, repo, "docs/cli.md", "Public CLI JSON and registry contract.", "required");
      addRead(reads, repo, "docs/debt-ledger.md", "Federated debt and pending source of truth.", "recommended");
      addRead(reads, repo, "docs/adr/0017-discoverability-and-meta-code-routing.md", "Discovery contract for durable meta-code.", "required");
      addRead(reads, repo, "docs/adr/0027-governance-identity-scope-model.md", "Governance identity, authority, scopes, and grants.", "recommended");
      addRead(reads, repo, "docs/adr/0028-workspace-project-folder-manifest.md", "Workspace/project/folder manifest boundary.", "recommended");
    }

    if (repo.repo === "clawix") {
      addRead(reads, repo, "docs/host-ownership.md", "Clawix host/framework boundary.", "required");
      addRead(reads, repo, "docs/adr/0010-interface-governance.md", "UI governance authority and visual mutation boundary.", "conditional");
      addRead(reads, repo, "docs/ui/README.md", "Interface governance router.", "conditional");
      addRead(reads, repo, "STYLE.md", "Visual canon for authorized UI work.", "conditional");
    }
  }
  return reads;
}

function addRead(reads: GovernanceDoctorRead[], repo: GovernanceDoctorRepo, relativePath: string, reason: string, priority: GovernanceDoctorRead["priority"]): void {
  if (fs.existsSync(path.join(repo.rootDir, relativePath))) reads.push({ repo: repo.repo, path: relativePath, reason, priority });
}

function buildSkills(repositories: GovernanceDoctorRepo[]): GovernanceDoctorSkill[] {
  const skills: GovernanceDoctorSkill[] = [];
  for (const repo of repositories) {
    for (const [id, reason, priority] of [
      ["cli-agent-surface-work", "Public CLI surface, JSON envelope, registry, help, docs, and tests.", "required"],
      ["decision-map-maintenance", "Decision-map rows and validation routing.", "required"],
      ["docs-alignment-update", "Docs routers, snippets, and stale-doc alignment.", "recommended"],
      ["adr-to-guardrail", "Durable decisions that need an enforcing guard.", "recommended"],
      ["surface-route-work", "Route graph or surface evidence changes.", "conditional"],
      ["public-hygiene-review", "Publication-safe docs and artifacts.", "recommended"],
      ["host-dependent-validation", "Signed-host or native permission validation boundaries.", "conditional"],
      ["code-hygiene-audit", "Report-only debt and stale code/doc cleanup.", "conditional"],
    ] as const) {
      addSkill(skills, repo, id, reason, priority);
    }

    if (repo.repo === "clawix") {
      for (const [id, reason] of [
        ["ui-canon-review", "Clawix UI canon, protected surfaces, and authorization rules."],
        ["ui-implementation", "Functional UI integration without unauthorized visual decisions."],
        ["visual-regression", "Visual evidence for authorized UI changes."],
        ["ui-performance-budget", "Critical-flow UI performance budgets and measurements."],
      ] as const) {
        addSkill(skills, repo, id, reason, "conditional");
      }
    }
  }
  return skills;
}

function addSkill(skills: GovernanceDoctorSkill[], repo: GovernanceDoctorRepo, id: string, reason: string, priority: GovernanceDoctorSkill["priority"]): void {
  const relativePath = `skills/${id}/SKILL.md`;
  if (fs.existsSync(path.join(repo.rootDir, relativePath))) skills.push({ repo: repo.repo, id, path: relativePath, reason, priority });
}

function buildChecks(repositories: GovernanceDoctorRepo[], binName: string): GovernanceDoctorCheck[] {
  const checks: GovernanceDoctorCheck[] = [];
  for (const repo of repositories) {
    if (repo.repo === "clawjs") {
      addCheck(checks, repo, "focused", `${binName} governance doctor --json`, "local_only", "Smoke the read-only governance router.");
      addCheck(checks, repo, "focused", "npm run test:governance", "local_only", "Close governance vocabulary and workspace/project goal guardrails.");
      addCheck(checks, repo, "docs", "npm run test:docs", "local_only", "Close docs, discoverability, registry, stale-doc, and public surface guards.");
      addCheck(checks, repo, "policy", "npm run test:policy", "local_only", "Close CLI registry/router parity and JSON envelope debt.");
      addCheck(checks, repo, "full", "npm run ci", "external_pending", "Full release-grade lane; some live/provider/device proof remains separate.");
    } else if (repo.repo === "clawix") {
      addCheck(checks, repo, "focused", "bash scripts/test.sh fast", "local_only", "Clawix fast validation lane.");
      addCheck(checks, repo, "docs", "bash scripts/doc_alignment_check.sh", "local_only", "Clawix docs and canon alignment.");
      addCheck(checks, repo, "docs", "node scripts/discoverability-check.mjs", "local_only", "Clawix discoverability route coverage.");
      addCheck(checks, repo, "policy", "bash macos/scripts/public_hygiene_check.sh", "local_only", "Public hygiene for native/public artifacts.");
      addCheck(checks, repo, "policy", "node scripts/check-clawjs-skills-sync.mjs", "local_only", "Projected skill sync with ClawJS.");
      addCheck(checks, repo, "host", "bash scripts/test.sh integration", "host_required", "Integration or signed-host-equivalent validation when affected.");
    } else {
      addCheck(checks, repo, "focused", `${binName} governance doctor --json --root ${shellQuote(repo.rootDir)}`, "local_only", "Smoke the fallback workspace governance router.");
    }
  }
  return checks;
}

function addCheck(checks: GovernanceDoctorCheck[], repo: GovernanceDoctorRepo, group: GovernanceDoctorCheck["group"], command: string, requirement: GovernanceDoctorCheck["requirement"], reason: string): void {
  checks.push({ repo: repo.repo, group, command, cwd: repo.rootDir, requirement, reason });
}

function buildExternalPending(entries: ClawDebtLedgerEntry[], repositories: GovernanceDoctorRepo[]): GovernanceDoctorExternalPending[] {
  return entries
    .filter((entry) => entry.classification === "external_pending" || entry.status === "external_pending" || entry.sourceType === "external_validation")
    .map((entry) => ({
      repo: entry.repo,
      id: entry.id,
      path: entry.canonicalSource,
      summary: entry.summary,
      blocker: isClosureBlocker(entry, repositories.find((repo) => repo.repo === entry.repo)),
      validation: entry.validation,
    }));
}

function isClosureBlocker(entry: ClawDebtLedgerEntry, repo: GovernanceDoctorRepo | undefined): boolean {
  if (entry.status === "blocked" || entry.classification === "goal_blocker" || entry.classification === "direct_blocker") return true;
  if (!repo) return false;
  const decisionMapPath = path.join(repo.rootDir, "docs", "decision-map.md");
  if (!fs.existsSync(decisionMapPath)) return false;
  const text = fs.readFileSync(decisionMapPath, "utf8");
  const index = text.indexOf(entry.canonicalSource);
  if (index < 0) return false;
  const window = text.slice(Math.max(0, index - 300), index + 700).toLowerCase();
  return window.includes("closure") || window.includes("completion") || window.includes("cannot close") || window.includes("external lanes require");
}

function buildStaleDocs(
  entries: ClawDebtLedgerEntry[],
  expiredEntries: ClawDebtLedgerEntry[],
  unindexedCandidates: Array<{ repo: string; path: string; matches: number; terms: string[] }>,
  repositories: GovernanceDoctorRepo[],
): GovernanceDoctorStaleDoc[] {
  const staleDocs: GovernanceDoctorStaleDoc[] = [];
  for (const entry of expiredEntries) {
    staleDocs.push({
      repo: entry.repo,
      path: entry.canonicalSource,
      status: "known_stale",
      guard: entry.validation,
      reason: `${entry.id} expired and needs review.`,
    });
  }
  for (const entry of entries.filter((candidate) => candidate.sourceType === "source_size" && candidate.status === "blocked")) {
    staleDocs.push({
      repo: entry.repo,
      path: entry.canonicalSource,
      status: "stale_risk",
      guard: entry.validation,
      reason: entry.summary,
    });
  }
  for (const candidate of unindexedCandidates) {
    staleDocs.push({
      repo: candidate.repo,
      path: candidate.path,
      status: "stale_risk",
      guard: "scripts/discoverability-check.mjs",
      reason: `Contains unindexed governance/debt terms: ${candidate.terms.join(", ")}.`,
    });
  }
  for (const repo of repositories) {
    if (repo.repo === "clawjs") {
      addNeedsCheck(staleDocs, repo, "docs/persistent-surface.md", "scripts/persistent-surface-doc-check.mjs", "Generated persistent surface docs can drift from inspect render output.");
      addNeedsCheck(staleDocs, repo, "docs/discoverability-baseline.json", "scripts/discoverability-check.mjs", "Expiring discoverability baseline must stay empty or reviewed.");
      addNeedsCheck(staleDocs, repo, "docs/cli.md", "scripts/docs-alignment-check.mjs", "CLI docs are stale-sensitive for public command changes.");
    }
    if (repo.repo === "clawix") {
      addNeedsCheck(staleDocs, repo, "docs/discoverability-baseline.json", "scripts/discoverability-check.mjs", "Clawix discoverability baseline must not hide new durable meta-code.");
      addNeedsCheck(staleDocs, repo, "docs/ui/debt.baseline.json", "scripts/ui_governance_guard.mjs", "UI debt baseline is stale-sensitive when touching visible surfaces.");
      addNeedsCheck(staleDocs, repo, "docs/persistent-surface-clawix.manifest.json", "scripts/persistent-surface-guard.mjs", "Clawix durable surface manifest must cover stable literals and routes.");
    }
  }
  return dedupeStaleDocs(staleDocs);
}

function addNeedsCheck(staleDocs: GovernanceDoctorStaleDoc[], repo: GovernanceDoctorRepo, relativePath: string, guard: string, reason: string): void {
  if (fs.existsSync(path.join(repo.rootDir, relativePath))) staleDocs.push({ repo: repo.repo, path: relativePath, status: "needs_check", guard, reason });
}

function dedupeStaleDocs(entries: GovernanceDoctorStaleDoc[]): GovernanceDoctorStaleDoc[] {
  return [...new Map(entries.map((entry) => [`${entry.repo}:${entry.path}:${entry.guard}:${entry.status}`, entry])).values()];
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
