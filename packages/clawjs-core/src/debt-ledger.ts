import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

import {
  detectClawPublicRepositories,
  type ClawRepositoryRoot,
} from "./repository-discovery.ts";

export const CLAW_DEBT_LEDGER_CLASSIFICATIONS = [
  "direct_blocker",
  "lateral_debt",
  "external_pending",
  "baseline_exception",
  "pre_existing_dirty",
  "inbox_followup",
  "goal_blocker",
] as const;

export const CLAW_DEBT_LEDGER_STATUSES = [
  "open",
  "active",
  "blocked",
  "external_pending",
  "baselined",
  "report_only",
  "expired",
  "resolved",
] as const;

export const CLAW_DEBT_LEDGER_SOURCE_TYPES = [
  "code_hygiene",
  "source_size",
  "surface_evidence",
  "ui_debt",
  "completion_audit",
  "external_validation",
  "adr_report",
  "goal",
  "inbox",
  "dirty_work",
] as const;

export const CLAW_DEBT_LEDGER_PRIVACY = [
  "public",
  "public_redacted",
  "private_summary",
  "private",
] as const;

export const clawDebtLedgerEntrySchema = z.object({
  id: z.string().min(1),
  repo: z.string().min(1),
  sourceType: z.enum(CLAW_DEBT_LEDGER_SOURCE_TYPES),
  classification: z.enum(CLAW_DEBT_LEDGER_CLASSIFICATIONS),
  status: z.enum(CLAW_DEBT_LEDGER_STATUSES),
  ownerArea: z.string().min(1),
  canonicalSource: z.string().min(1),
  summary: z.string().min(1),
  risk: z.string().min(1),
  expires: z.string().optional(),
  reviewBy: z.string().optional(),
  reentryCondition: z.string().min(1),
  reentryCommand: z.string().min(1).optional(),
  validation: z.string().min(1),
  privacy: z.enum(CLAW_DEBT_LEDGER_PRIVACY),
  fingerprint: z.string().min(12),
});

export const clawDebtLedgerSourceSchema = z.object({
  repo: z.string().min(1),
  root: z.string().min(1),
  sourceType: z.enum(CLAW_DEBT_LEDGER_SOURCE_TYPES),
  path: z.string().min(1),
  status: z.enum(["read", "missing", "invalid"]),
  entries: z.number().int().nonnegative(),
  warning: z.string().optional(),
});

export const clawDebtLedgerAuditSchema = z.object({
  ok: z.literal(true),
  mode: z.literal("report_only"),
  warnings: z.array(z.string()),
  missingActionability: z.array(z.object({
    repo: z.string(),
    id: z.string(),
    sourceType: z.enum(CLAW_DEBT_LEDGER_SOURCE_TYPES),
    classification: z.enum(CLAW_DEBT_LEDGER_CLASSIFICATIONS),
    status: z.enum(CLAW_DEBT_LEDGER_STATUSES),
    canonicalSource: z.string(),
    summary: z.string(),
    missing: z.array(z.string()),
  })),
  aliasHits: z.array(z.object({
    repo: z.string(),
    path: z.string(),
    term: z.string(),
    normalizedClassification: z.enum(CLAW_DEBT_LEDGER_CLASSIFICATIONS),
    normalizedStatus: z.enum(CLAW_DEBT_LEDGER_STATUSES),
    matches: z.number().int().positive(),
  })),
  unindexedCandidates: z.array(z.object({
    repo: z.string(),
    path: z.string(),
    matches: z.number().int().nonnegative(),
    terms: z.array(z.string()),
  })),
  expiredEntries: z.array(clawDebtLedgerEntrySchema),
  duplicateFingerprints: z.array(z.object({
    fingerprint: z.string(),
    ids: z.array(z.string()),
  })),
  privateSummary: z.object({
    included: z.literal(false),
    reason: z.string(),
  }),
});

export const clawDebtLedgerSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string(),
  sourceOfTruth: z.literal("federated_public_references"),
  mode: z.literal("report_only"),
  classifications: z.array(z.enum(CLAW_DEBT_LEDGER_CLASSIFICATIONS)),
  statuses: z.array(z.enum(CLAW_DEBT_LEDGER_STATUSES)),
  entries: z.array(clawDebtLedgerEntrySchema),
  sources: z.array(clawDebtLedgerSourceSchema),
  audit: clawDebtLedgerAuditSchema,
});

export type ClawDebtLedgerClassification = typeof CLAW_DEBT_LEDGER_CLASSIFICATIONS[number];
export type ClawDebtLedgerStatus = typeof CLAW_DEBT_LEDGER_STATUSES[number];
export type ClawDebtLedgerSourceType = typeof CLAW_DEBT_LEDGER_SOURCE_TYPES[number];
export type ClawDebtLedgerPrivacy = typeof CLAW_DEBT_LEDGER_PRIVACY[number];
export type ClawDebtLedgerEntry = z.infer<typeof clawDebtLedgerEntrySchema>;
export type ClawDebtLedgerSource = z.infer<typeof clawDebtLedgerSourceSchema>;
export type ClawDebtLedgerAudit = z.infer<typeof clawDebtLedgerAuditSchema>;
export type ClawDebtLedger = z.infer<typeof clawDebtLedgerSchema>;

export type ClawDebtLedgerRepositoryRoot = Pick<ClawRepositoryRoot, "repo" | "rootDir">;

export interface BuildClawDebtLedgerOptions {
  rootDir: string;
  generatedAt?: string;
  repositories?: ClawDebtLedgerRepositoryRoot[];
}

interface MutableDebtLedger {
  entries: ClawDebtLedgerEntry[];
  sources: ClawDebtLedgerSource[];
  warnings: string[];
}

const debtAliasTerms: ReadonlyArray<{
  term: string;
  normalizedClassification: ClawDebtLedgerClassification;
  normalizedStatus: ClawDebtLedgerStatus;
}> = [
  { term: "EXTERNAL PENDING", normalizedClassification: "external_pending", normalizedStatus: "external_pending" },
  { term: "external_pending", normalizedClassification: "external_pending", normalizedStatus: "external_pending" },
  { term: "blocked-external-pending", normalizedClassification: "external_pending", normalizedStatus: "blocked" },
  { term: "lateral_debt", normalizedClassification: "lateral_debt", normalizedStatus: "open" },
  { term: "pre_existing_dirty", normalizedClassification: "pre_existing_dirty", normalizedStatus: "open" },
  { term: "goal sigue activo", normalizedClassification: "goal_blocker", normalizedStatus: "active" },
  { term: "deuda lateral", normalizedClassification: "lateral_debt", normalizedStatus: "open" },
  { term: "pendiente", normalizedClassification: "external_pending", normalizedStatus: "open" },
  { term: "blocked", normalizedClassification: "direct_blocker", normalizedStatus: "blocked" },
];

const candidateTerms = [...debtAliasTerms.map((entry) => entry.term), "TODO", "FIXME"];
const aliasScanPaths = [
  "docs/decision-map.md",
  "docs/discoverability.md",
  "docs/agent-rules/index.md",
  "docs/debt-ledger.md",
  "docs/code-hygiene-ledger.md",
  "docs/governance/system-telemetry/completion.md",
  "docs/governance/sdk-first-custom-surfaces/completion.md",
  "docs/governance/ui/completion.md",
];

export function buildClawDebtLedger(options: BuildClawDebtLedgerOptions): ClawDebtLedger {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const repositories = options.repositories ?? detectDebtLedgerRepositories(options.rootDir);
  const state: MutableDebtLedger = { entries: [], sources: [], warnings: [] };

  for (const repository of repositories) {
    collectRepositoryDebt(repository, state);
  }

  const duplicateFingerprints = findDuplicateFingerprints(state.entries);
  const entries = dedupeEntries(state.entries).sort((left, right) => left.repo.localeCompare(right.repo) || left.id.localeCompare(right.id));
  const sources = state.sources.map((source) => ({
    ...source,
    entries: entries.filter((entry) => entry.repo === source.repo && entry.sourceType === source.sourceType && entry.canonicalSource === source.path).length,
  }));
  const expiredEntries = entries.filter((entry) => isExpired(entry, generatedAt));
  const missingActionability = collectMissingActionability(entries, generatedAt);
  const audit: ClawDebtLedgerAudit = {
    ok: true,
    mode: "report_only",
    warnings: state.warnings,
    missingActionability,
    aliasHits: collectAliasHits(repositories),
    unindexedCandidates: collectUnindexedCandidates(repositories, entries),
    expiredEntries,
    duplicateFingerprints,
    privateSummary: {
      included: false,
      reason: "Public debt ledger excludes .codex goals, sessions, inbox directives, and dirty work. Use the private overlay runner from the Clawix private workspace for local redacted aggregation.",
    },
  };

  return clawDebtLedgerSchema.parse({
    schemaVersion: 1,
    generatedAt,
    sourceOfTruth: "federated_public_references",
    mode: "report_only",
    classifications: [...CLAW_DEBT_LEDGER_CLASSIFICATIONS],
    statuses: [...CLAW_DEBT_LEDGER_STATUSES],
    entries,
    sources,
    audit,
  });
}

export function detectDebtLedgerRepositories(rootDir: string): ClawDebtLedgerRepositoryRoot[] {
  return detectClawPublicRepositories(rootDir, { includeFallback: true });
}

function collectRepositoryDebt(repository: ClawDebtLedgerRepositoryRoot, state: MutableDebtLedger): void {
  collectCodeHygieneBaseline(repository, state);
  collectSourceSizeBaseline(repository, state);
  collectSurfaceEvidenceBaseline(repository, state, "docs/surface-evidence-baseline.json");
  collectSurfaceEvidenceBaseline(repository, state, "docs/surface-evidence-projection-baseline.json");
  collectUiDebtBaseline(repository, state);
  collectExternalValidationManifest(repository, state);
  collectCompletionAudits(repository, state);
  collectCodeHygieneLedger(repository, state);
}

function collectCodeHygieneBaseline(repository: ClawDebtLedgerRepositoryRoot, state: MutableDebtLedger): void {
  const sourcePath = "docs/code-hygiene-baseline.json";
  const json = readRepoJson(repository, sourcePath, "code_hygiene", state);
  if (!isRecord(json)) return;
  for (const entry of arrayOfRecords(json.entries)) {
    const id = stringField(entry.id) ?? stableId(repository.repo, sourcePath, stringField(entry.reason) ?? "code-hygiene");
    addEntry(state, repository, {
      id,
      sourceType: "code_hygiene",
      classification: "baseline_exception",
      status: "baselined",
      ownerArea: stringField(entry.ownerArea) ?? "code-hygiene",
      canonicalSource: sourcePath,
      summary: stringField(entry.reason) ?? `Code hygiene baseline ${id}`,
      risk: `Retained finding types: ${stringArray(entry.findingTypes).join(", ") || "unspecified"}.`,
      expires: stringField(entry.expiresAt),
      reviewBy: stringField(entry.expiresAt),
      reentryCondition: `Review ${id} before expiry or when listed paths are touched.`,
      reentryCommand: "node scripts/code-hygiene-check.mjs",
      validation: "scripts/code-hygiene-check.mjs",
      privacy: "public",
    });
  }
}

function collectSourceSizeBaseline(repository: ClawDebtLedgerRepositoryRoot, state: MutableDebtLedger): void {
  const sourcePath = "docs/source-size-baseline.json";
  const json = readRepoJson(repository, sourcePath, "source_size", state);
  if (!isRecord(json) || !isRecord(json.files)) return;
  for (const [filePath, entry] of Object.entries(json.files)) {
    if (!isRecord(entry)) continue;
    addEntry(state, repository, {
      id: stableId(repository.repo, sourcePath, filePath),
      sourceType: "source_size",
      classification: "baseline_exception",
      status: entry.blockGrowth === true ? "blocked" : "baselined",
      ownerArea: "source-size",
      canonicalSource: sourcePath,
      summary: `${filePath}: ${stringField(entry.reason) ?? "source-size baseline"}`,
      risk: "Large hand-authored source can keep growing unless split work is routed deliberately.",
      reentryCondition: `Any change that expands ${filePath}, or expiry of the source-size baseline policy.`,
      reentryCommand: "node scripts/source-size-check.mjs",
      validation: "scripts/source-size-check.mjs",
      privacy: "public",
    });
  }
}

function collectSurfaceEvidenceBaseline(repository: ClawDebtLedgerRepositoryRoot, state: MutableDebtLedger, sourcePath: string): void {
  const json = readRepoJson(repository, sourcePath, "surface_evidence", state);
  if (!isRecord(json)) return;
  for (const entry of arrayOfRecords(json.entries)) {
    const classification = parseClassification(stringField(entry.classification), "lateral_debt");
    const id = stringField(entry.id) ?? stableId(repository.repo, sourcePath, stringArray(entry.nodeIds).join(","));
    addEntry(state, repository, {
      id,
      sourceType: "surface_evidence",
      classification,
      status: classification === "external_pending" ? "external_pending" : "baselined",
      ownerArea: stringField(entry.owner) ?? "surface-evidence",
      canonicalSource: sourcePath,
      summary: stringField(entry.reason) ?? `Surface evidence baseline ${id}`,
      risk: stringField(entry.risk) ?? "Route or contract evidence is incomplete.",
      expires: stringField(entry.expires),
      reviewBy: stringField(entry.expires),
      reentryCondition: stringField(entry.reentryCondition) ?? "Review when affected route, surface, or contract changes.",
      reentryCommand: sourcePath.includes("projection") ? "node scripts/surface-evidence-projection-check.mjs" : "node --import tsx scripts/surface-evidence-guard.mjs",
      validation: sourcePath.includes("projection") ? "scripts/surface-evidence-projection-check.mjs" : "scripts/surface-evidence-guard.mjs",
      privacy: "public",
    });
  }
}

function collectUiDebtBaseline(repository: ClawDebtLedgerRepositoryRoot, state: MutableDebtLedger): void {
  const sourcePath = "docs/ui/debt.baseline.json";
  const json = readRepoJson(repository, sourcePath, "ui_debt", state);
  if (!isRecord(json)) return;
  const defaultExpiry = stringField(json.reviewAfter);
  for (const entry of arrayOfRecords(json.entries)) {
    const id = stringField(entry.id) ?? stableId(repository.repo, sourcePath, stringField(entry.scope) ?? "ui");
    addEntry(state, repository, {
      id,
      sourceType: "ui_debt",
      classification: "baseline_exception",
      status: "baselined",
      ownerArea: stringField(entry.owner) ?? "ui-governance",
      canonicalSource: sourcePath,
      summary: stringField(entry.reason) ?? `UI debt baseline ${id}`,
      risk: stringField(entry.allowedAction) ?? "Existing visual drift is frozen and must not expand.",
      expires: stringField(entry.reviewAfter) ?? defaultExpiry,
      reviewBy: stringField(entry.reviewAfter) ?? defaultExpiry,
      reentryCondition: "Review when the scoped surface is touched or visual-authorized cleanup starts.",
      reentryCommand: "node scripts/ui_governance_guard.mjs",
      validation: "scripts/ui_governance_guard.mjs",
      privacy: "public_redacted",
    });
  }
}

function collectExternalValidationManifest(repository: ClawDebtLedgerRepositoryRoot, state: MutableDebtLedger): void {
  const sourcePath = "docs/governance/system-telemetry/external-validation.manifest.json";
  const json = readRepoJson(repository, sourcePath, "external_validation", state);
  if (!isRecord(json)) return;
  const rowIds = [
    ...stringArray(recordAt(json, ["completionAudit", "statusSummary"])?.externalPendingRowIds),
    ...stringArray(recordAt(json, ["externalValidationRunbook"])?.externalPendingRowIds),
  ];
  const rows = arrayOfRecords(json.rows);
  for (const rowId of [...new Set(rowIds)]) {
    const row = rows.find((candidate) => stringField(candidate.id) === rowId)
      ?? rows.find((candidate) => stringArray(candidate.linkedPromiseIds).includes(rowId));
    addEntry(state, repository, {
      id: stableId(repository.repo, sourcePath, rowId),
      sourceType: "external_validation",
      classification: "external_pending",
      status: "external_pending",
      ownerArea: "system-telemetry",
      canonicalSource: sourcePath,
      summary: `${rowId} remains externally pending in the system telemetry validation manifest.`,
      risk: "Local validation cannot prove provider, physical sensor, or dangerous-control behavior.",
      reentryCondition: "Replace only with exact-run approval, redacted evidence, same-lane closure, and source Q/A review.",
      reentryCommand: stringField(row?.reentryCommand),
      validation: "scripts/verify-system-telemetry-goal.mjs",
      privacy: "public_redacted",
    });
  }
}

function collectCompletionAudits(repository: ClawDebtLedgerRepositoryRoot, state: MutableDebtLedger): void {
  for (const sourcePath of [
    "docs/governance/system-telemetry/completion.md",
    "docs/governance/sdk-first-custom-surfaces/completion.md",
    "docs/governance/ui/completion.md",
  ]) {
    const text = readRepoText(repository, sourcePath, "completion_audit", state);
    if (!text) continue;
    for (const line of text.split(/\r?\n/)) {
      if (!/EXTERNAL PENDING|blocked-external-pending|active_goal_not_complete/i.test(line)) continue;
      const clean = compact(line.replaceAll("`", ""));
      const validation = sourcePath.includes("/ui/") ? "scripts/ui_completion_audit_check.mjs" : "goal verifier listed in the completion audit";
      const reentryCommand = sourcePath.includes("/ui/")
        ? "node scripts/ui_completion_audit_check.mjs"
        : sourcePath.includes("sdk-first")
          ? "node scripts/verify-sdk-first-custom-surfaces-goal.mjs"
          : "node scripts/verify-system-telemetry-goal.mjs";
      addEntry(state, repository, {
        id: stableId(repository.repo, sourcePath, clean),
        sourceType: "completion_audit",
        classification: clean.includes("EXTERNAL PENDING") || clean.includes("blocked-external-pending") ? "external_pending" : "goal_blocker",
        status: clean.includes("verified-complete") ? "resolved" : clean.includes("blocked") ? "blocked" : "open",
        ownerArea: sourcePath.includes("/ui/") ? "ui-governance" : sourcePath.includes("sdk-first") ? "custom-app-sdk" : "system-telemetry",
        canonicalSource: sourcePath,
        summary: clean.slice(0, 220),
        risk: "Completion can be misread as finished unless this blocker stays visible in the unified ledger.",
        reentryCondition: "Review before marking the source goal complete.",
        reentryCommand,
        validation,
        privacy: "public_redacted",
      });
    }
  }
}

function collectCodeHygieneLedger(repository: ClawDebtLedgerRepositoryRoot, state: MutableDebtLedger): void {
  const sourcePath = "docs/code-hygiene-ledger.md";
  const text = readRepoText(repository, sourcePath, "code_hygiene", state);
  if (!text) return;
  const sections = text.split(/^## /m).slice(1);
  for (const section of sections) {
    const title = section.split(/\r?\n/)[0] ?? "code hygiene ledger";
    const status = section.match(/Status:\s*([A-Z _-]+)/)?.[1]?.trim().toLowerCase().replaceAll(" ", "_");
    if (!status || !["external_pending", "partial", "active"].includes(status)) continue;
    addEntry(state, repository, {
      id: stableId(repository.repo, sourcePath, title),
      sourceType: "code_hygiene",
      classification: status === "external_pending" ? "external_pending" : "baseline_exception",
      status: status === "external_pending" ? "external_pending" : status === "partial" ? "open" : "active",
      ownerArea: "code-hygiene",
      canonicalSource: sourcePath,
      summary: title.trim(),
      risk: compact(section).slice(0, 220),
      reentryCondition: "Review during code hygiene campaigns or before closing the hygiene program.",
      reentryCommand: "node scripts/code-hygiene-check.mjs",
      validation: "scripts/code-hygiene-check.mjs",
      privacy: "public_redacted",
    });
  }
}

function readRepoJson(repository: ClawDebtLedgerRepositoryRoot, relativePath: string, sourceType: ClawDebtLedgerSourceType, state: MutableDebtLedger): unknown {
  const absolutePath = path.join(repository.rootDir, relativePath);
  if (!fs.existsSync(absolutePath)) {
    state.sources.push({ repo: repository.repo, root: repository.rootDir, sourceType, path: relativePath, status: "missing", entries: 0 });
    return null;
  }
  try {
    const json = JSON.parse(fs.readFileSync(absolutePath, "utf8"));
    state.sources.push({ repo: repository.repo, root: repository.rootDir, sourceType, path: relativePath, status: "read", entries: 0 });
    return json;
  } catch (error) {
    state.sources.push({ repo: repository.repo, root: repository.rootDir, sourceType, path: relativePath, status: "invalid", entries: 0, warning: error instanceof Error ? error.message : String(error) });
    state.warnings.push(`${repository.repo}:${relativePath} could not be parsed as JSON`);
    return null;
  }
}

function readRepoText(repository: ClawDebtLedgerRepositoryRoot, relativePath: string, sourceType: ClawDebtLedgerSourceType, state: MutableDebtLedger): string | null {
  const absolutePath = path.join(repository.rootDir, relativePath);
  if (!fs.existsSync(absolutePath)) {
    state.sources.push({ repo: repository.repo, root: repository.rootDir, sourceType, path: relativePath, status: "missing", entries: 0 });
    return null;
  }
  try {
    const text = fs.readFileSync(absolutePath, "utf8");
    state.sources.push({ repo: repository.repo, root: repository.rootDir, sourceType, path: relativePath, status: "read", entries: 0 });
    return text;
  } catch (error) {
    state.sources.push({ repo: repository.repo, root: repository.rootDir, sourceType, path: relativePath, status: "invalid", entries: 0, warning: error instanceof Error ? error.message : String(error) });
    state.warnings.push(`${repository.repo}:${relativePath} could not be read`);
    return null;
  }
}

function addEntry(state: MutableDebtLedger, repository: ClawDebtLedgerRepositoryRoot, input: Omit<ClawDebtLedgerEntry, "repo" | "fingerprint">): void {
  const entry = {
    ...input,
    repo: repository.repo,
    summary: compact(input.summary),
    risk: compact(input.risk),
    fingerprint: fingerprintEntry(repository.repo, input),
  };
  if (containsPrivatePath(`${entry.summary}\n${entry.risk}\n${entry.canonicalSource}`)) {
    entry.summary = redactPrivatePaths(entry.summary);
    entry.risk = redactPrivatePaths(entry.risk);
    if (entry.privacy === "public") entry.privacy = "public_redacted";
  }
  state.entries.push(clawDebtLedgerEntrySchema.parse(entry));
}

function collectUnindexedCandidates(repositories: ClawDebtLedgerRepositoryRoot[], entries: ClawDebtLedgerEntry[]): ClawDebtLedgerAudit["unindexedCandidates"] {
  const coveredPaths = new Set(entries.map((entry) => `${entry.repo}:${entry.canonicalSource}`));
  const candidates: ClawDebtLedgerAudit["unindexedCandidates"] = [];
  for (const repository of repositories) {
    for (const relativePath of ["docs/decision-map.md", "docs/discoverability.md", "docs/agent-rules/index.md"]) {
      if (coveredPaths.has(`${repository.repo}:${relativePath}`)) continue;
      const absolutePath = path.join(repository.rootDir, relativePath);
      if (!fs.existsSync(absolutePath)) continue;
      const text = fs.readFileSync(absolutePath, "utf8");
      const terms = candidateTerms.filter((term) => text.includes(term));
      if (terms.length === 0) continue;
      const matches = terms.reduce((count, term) => count + text.split(term).length - 1, 0);
      candidates.push({ repo: repository.repo, path: relativePath, matches, terms });
    }
  }
  return candidates;
}

function collectMissingActionability(entries: ClawDebtLedgerEntry[], generatedAt: string): ClawDebtLedgerAudit["missingActionability"] {
  return entries
    .map((entry) => ({ entry, missing: debtLedgerMissingActionabilityFields(entry, generatedAt) }))
    .filter((candidate) => candidate.missing.length > 0)
    .map(({ entry, missing }) => ({
      repo: entry.repo,
      id: entry.id,
      sourceType: entry.sourceType,
      classification: entry.classification,
      status: entry.status,
      canonicalSource: entry.canonicalSource,
      summary: entry.summary,
      missing,
    }));
}

function collectAliasHits(repositories: ClawDebtLedgerRepositoryRoot[]): ClawDebtLedgerAudit["aliasHits"] {
  const hits: ClawDebtLedgerAudit["aliasHits"] = [];
  for (const repository of repositories) {
    for (const relativePath of aliasScanPaths) {
      const absolutePath = path.join(repository.rootDir, relativePath);
      if (!fs.existsSync(absolutePath)) continue;
      const text = fs.readFileSync(absolutePath, "utf8");
      for (const alias of debtAliasTerms) {
        const matches = countTermMatches(text, alias.term);
        if (matches === 0) continue;
        hits.push({ repo: repository.repo, path: relativePath, ...alias, matches });
      }
    }
  }
  return hits;
}

function findDuplicateFingerprints(entries: ClawDebtLedgerEntry[]): ClawDebtLedgerAudit["duplicateFingerprints"] {
  const grouped = new Map<string, string[]>();
  for (const entry of entries) {
    const ids = grouped.get(entry.fingerprint) ?? [];
    ids.push(entry.id);
    grouped.set(entry.fingerprint, ids);
  }
  return [...grouped.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([fingerprint, ids]) => ({ fingerprint, ids }));
}

function dedupeEntries(entries: ClawDebtLedgerEntry[]): ClawDebtLedgerEntry[] {
  const byFingerprint = new Map<string, ClawDebtLedgerEntry>();
  for (const entry of entries) {
    const previous = byFingerprint.get(entry.fingerprint);
    if (!previous || priority(entry) > priority(previous)) byFingerprint.set(entry.fingerprint, entry);
  }
  return [...byFingerprint.values()];
}

function priority(entry: ClawDebtLedgerEntry): number {
  if (entry.classification === "direct_blocker") return 4;
  if (entry.classification === "external_pending") return 3;
  if (entry.status === "blocked") return 2;
  return 1;
}

function fingerprintEntry(repo: string, input: Omit<ClawDebtLedgerEntry, "repo" | "fingerprint">): string {
  return createHash("sha256").update([
    repo,
    input.sourceType,
    input.classification,
    input.canonicalSource,
    input.summary,
  ].join("\n")).digest("hex").slice(0, 16);
}

function stableId(repo: string, sourcePath: string, seed: string): string {
  const slug = `${repo}-${sourcePath}-${seed}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 72) || "debt";
  const hash = createHash("sha256").update(`${repo}\n${sourcePath}\n${seed}`).digest("hex").slice(0, 8);
  return `${slug}-${hash}`;
}

function parseClassification(value: string | undefined, fallback: ClawDebtLedgerClassification): ClawDebtLedgerClassification {
  return (CLAW_DEBT_LEDGER_CLASSIFICATIONS as readonly string[]).includes(value ?? "") ? value as ClawDebtLedgerClassification : fallback;
}

function isExpired(entry: ClawDebtLedgerEntry, generatedAt: string): boolean {
  const reviewDate = entry.reviewBy ?? entry.expires;
  return !!reviewDate && reviewDate < generatedAt.slice(0, 10);
}

export function debtLedgerMissingActionabilityFields(entry: ClawDebtLedgerEntry, generatedAt = new Date().toISOString()): string[] {
  const missing: string[] = [];
  if (!entry.ownerArea) missing.push("ownerArea");
  if (!entry.reviewBy && !entry.expires) missing.push("reviewBy_or_expires");
  if (!entry.reentryCondition) missing.push("reentryCondition");
  if (!entry.reentryCommand) missing.push("reentryCommand");
  if (!entry.validation) missing.push("validation");
  if (isExpired(entry, generatedAt)) missing.push("review_expired");
  return missing;
}

export function debtLedgerEntryNeedsAction(entry: ClawDebtLedgerEntry, generatedAt = new Date().toISOString()): boolean {
  return debtLedgerMissingActionabilityFields(entry, generatedAt).length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function recordAt(value: unknown, keys: string[]): Record<string, unknown> | null {
  let current = value;
  for (const key of keys) {
    if (!isRecord(current)) return null;
    current = current[key];
  }
  return isRecord(current) ? current : null;
}

function arrayOfRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0) : [];
}

function compact(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function countTermMatches(text: string, term: string): number {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.match(new RegExp(escaped, "gi"))?.length ?? 0;
}

function containsPrivatePath(value: string): boolean {
  return /\/Users\/[^/\s]+\/|~\/\.codex|\.codex\/sessions|private-agent-playbooks/.test(value);
}

function redactPrivatePaths(value: string): string {
  return value
    .replace(/\/Users\/[^/\s]+\/[^\s)]+/g, "<private-path>")
    .replace(/~\/\.codex[^\s)]*/g, "<private-codex-path>");
}
