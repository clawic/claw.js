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
  "baseline_debt_control",
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

export const CLAW_DEBT_CONTROL_SEVERITIES = ["P0", "P1", "P2", "P3"] as const;

export const CLAW_DEBT_CONTROL_RELEASE_EFFECTS = [
  "blocks_release",
  "blocks_growth",
  "report_only",
] as const;

export const clawDebtControlBudgetSchema = z.object({
  metric: z.string().min(1),
  unit: z.string().min(1),
  current: z.number().nonnegative(),
  maxAllowed: z.number().nonnegative(),
  nextMaxAllowed: z.number().nonnegative(),
  target: z.number().nonnegative(),
  cadence: z.string().min(1),
});

export const clawDebtControlReleaseEffectSchema = z.object({
  mode: z.enum(CLAW_DEBT_CONTROL_RELEASE_EFFECTS),
  targets: z.array(z.string().min(1)),
  gate: z.string().min(1),
  reason: z.string().min(1),
});

export const clawDebtControlSchema = z.object({
  ownerArea: z.string().min(1),
  expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  severity: z.enum(CLAW_DEBT_CONTROL_SEVERITIES),
  budget: clawDebtControlBudgetSchema,
  releaseEffect: clawDebtControlReleaseEffectSchema,
});

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
  debtControl: clawDebtControlSchema,
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
  strictFailures: z.array(z.object({
    repo: z.string(),
    id: z.string(),
    sourceType: z.enum(CLAW_DEBT_LEDGER_SOURCE_TYPES),
    canonicalSource: z.string(),
    severity: z.enum(CLAW_DEBT_CONTROL_SEVERITIES).optional(),
    reason: z.string(),
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
export type ClawDebtControlSeverity = typeof CLAW_DEBT_CONTROL_SEVERITIES[number];
export type ClawDebtControlReleaseEffect = typeof CLAW_DEBT_CONTROL_RELEASE_EFFECTS[number];
export type ClawDebtControl = z.infer<typeof clawDebtControlSchema>;
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
  strictFailures: ClawDebtLedgerAudit["strictFailures"];
}

interface DebtControlFallback {
  ownerArea: string;
  expiresAt?: string;
  severity?: ClawDebtControlSeverity;
  metric: string;
  unit: string;
  current: number;
  maxAllowed?: number;
  nextMaxAllowed?: number;
  target?: number;
  cadence?: string;
  releaseEffectMode?: ClawDebtControlReleaseEffect;
  releaseTargets?: string[];
  releaseGate?: string;
  releaseReason?: string;
}

type DebtLedgerEntryInput = Omit<ClawDebtLedgerEntry, "repo" | "fingerprint" | "debtControl"> & {
  debtControl?: unknown;
  debtControlFallback: DebtControlFallback;
};

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
  const state: MutableDebtLedger = { entries: [], sources: [], warnings: [], strictFailures: [] };

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
    strictFailures: [
      ...state.strictFailures,
      ...collectStrictDebtControlFailures(entries, generatedAt),
    ],
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
      debtControl: entry.debtControl,
      debtControlFallback: {
        ownerArea: stringField(entry.ownerArea) ?? "code-hygiene",
        expiresAt: stringField(entry.expiresAt),
        severity: "P2",
        metric: "baselined_findings",
        unit: "finding",
        current: Math.max(1, stringArray(entry.findingTypes).length || 1),
        cadence: "expiry",
        releaseEffectMode: "blocks_growth",
        releaseGate: "scripts/code-hygiene-check.mjs",
        releaseReason: "Code hygiene baselines must not grow without classification.",
      },
    });
  }
}

function collectSourceSizeBaseline(repository: ClawDebtLedgerRepositoryRoot, state: MutableDebtLedger): void {
  const sourcePath = "docs/source-size-baseline.json";
  const json = readRepoJson(repository, sourcePath, "source_size", state);
  if (!isRecord(json) || !isRecord(json.files)) return;
  for (const [filePath, entry] of Object.entries(json.files)) {
    if (!isRecord(entry)) continue;
    const lines = numberField(entry.lines) ?? 1;
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
      debtControl: entry.debtControl,
      debtControlFallback: {
        ownerArea: stringField(entry.ownerArea) ?? "source-size",
        expiresAt: stringField(entry.expiresAt) ?? stringField(json.expiresAt),
        severity: entry.blockGrowth === true ? "P1" : "P2",
        metric: "source_lines",
        unit: "line",
        current: lines,
        maxAllowed: lines,
        nextMaxAllowed: Math.max(0, lines - 1),
        target: numberField(json.baselineRequiredLines) ?? 1200,
        cadence: "next_touch_or_expiry",
        releaseEffectMode: entry.blockGrowth === true ? "blocks_release" : "blocks_growth",
        releaseTargets: entry.blockGrowth === true ? ["changed-work"] : ["changed-work"],
        releaseGate: "scripts/source-size-check.mjs",
        releaseReason: "Large source baselines must shrink or block additional growth.",
      },
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
      debtControl: entry.debtControl,
      debtControlFallback: {
        ownerArea: stringField(entry.owner) ?? stringField(entry.ownerArea) ?? stringField(entry.steward) ?? "surface-evidence",
        expiresAt: stringField(entry.expires) ?? stringField(entry.expiresAt),
        severity: classification === "external_pending" ? "P1" : "P2",
        metric: "missing_surface_evidence",
        unit: "item",
        current: aggregateEntryCount(entry),
        cadence: "expiry",
        releaseEffectMode: classification === "external_pending" ? "blocks_release" : "blocks_growth",
        releaseTargets: classification === "external_pending" ? ["release-readiness"] : ["changed-work"],
        releaseGate: sourcePath.includes("projection") ? "scripts/surface-evidence-projection-check.mjs" : "scripts/surface-evidence-guard.mjs",
        releaseReason: "Surface evidence debt must shrink before affected release claims are accepted.",
      },
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
      debtControl: entry.debtControl,
      debtControlFallback: {
        ownerArea: stringField(entry.owner) ?? "ui-governance",
        expiresAt: stringField(entry.reviewAfter) ?? defaultExpiry,
        severity: "P2",
        metric: "ui_debt_entries",
        unit: "entry",
        current: 1,
        cadence: "review_after",
        releaseEffectMode: "blocks_growth",
        releaseGate: "scripts/ui_governance_guard.mjs",
        releaseReason: "Frozen UI debt cannot expand without visual authorization.",
      },
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
      debtControl: row?.debtControl,
      debtControlFallback: {
        ownerArea: "system-telemetry",
        expiresAt: stringField(row?.expiresAt),
        severity: "P1",
        metric: "external_pending_rows",
        unit: "row",
        current: 1,
        cadence: "release_target",
        releaseEffectMode: "blocks_release",
        releaseTargets: ["release-readiness"],
        releaseGate: "scripts/verify-system-telemetry-goal.mjs",
        releaseReason: "External validation gaps block affected release claims until evidence exists.",
      },
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
        debtControlFallback: {
          ownerArea: sourcePath.includes("/ui/") ? "ui-governance" : sourcePath.includes("sdk-first") ? "custom-app-sdk" : "system-telemetry",
          severity: clean.includes("EXTERNAL PENDING") || clean.includes("blocked-external-pending") ? "P1" : "P2",
          metric: "completion_blockers",
          unit: "row",
          current: 1,
          cadence: "goal_closure",
          releaseEffectMode: clean.includes("EXTERNAL PENDING") || clean.includes("blocked-external-pending") ? "blocks_release" : "blocks_growth",
          releaseTargets: clean.includes("EXTERNAL PENDING") || clean.includes("blocked-external-pending") ? ["release-readiness"] : ["changed-work"],
          releaseGate: validation,
          releaseReason: "Completion blockers cannot be treated as success until the source verifier passes.",
        },
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
      debtControlFallback: {
        ownerArea: "code-hygiene",
        severity: status === "external_pending" ? "P1" : "P2",
        metric: "code_hygiene_ledger_items",
        unit: "item",
        current: 1,
        cadence: "program_closure",
        releaseEffectMode: status === "external_pending" ? "blocks_release" : "blocks_growth",
        releaseTargets: status === "external_pending" ? ["release-readiness"] : ["changed-work"],
        releaseGate: "scripts/code-hygiene-check.mjs",
        releaseReason: "Code hygiene ledger blockers must shrink or remain release-visible.",
      },
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

function addEntry(state: MutableDebtLedger, repository: ClawDebtLedgerRepositoryRoot, input: DebtLedgerEntryInput): void {
  const debtControl = normalizeDebtControl(input.debtControl, input.debtControlFallback);
  const entry = {
    ...input,
    debtControl,
    repo: repository.repo,
    summary: compact(input.summary),
    risk: compact(input.risk),
    fingerprint: fingerprintEntry(repository.repo, input),
  };
  delete (entry as { debtControlFallback?: unknown }).debtControlFallback;
  if (containsPrivatePath(`${entry.summary}\n${entry.risk}\n${entry.canonicalSource}`)) {
    entry.summary = redactPrivatePaths(entry.summary);
    entry.risk = redactPrivatePaths(entry.risk);
    if (entry.privacy === "public") entry.privacy = "public_redacted";
  }
  const parsed = clawDebtLedgerEntrySchema.parse(entry);
  const explicitDebtControlRequired = requiresExplicitDebtControl(parsed);
  if (!input.debtControl && explicitDebtControlRequired) {
    state.strictFailures.push({
      repo: repository.repo,
      id: parsed.id,
      sourceType: parsed.sourceType,
      canonicalSource: parsed.canonicalSource,
      severity: parsed.debtControl.severity,
      reason: "debtControl must be declared explicitly by the source baseline",
    });
  } else if (explicitDebtControlRequired) {
    state.strictFailures.push(...rawDebtControlStrictFailures(repository.repo, parsed, input.debtControl));
  }
  state.entries.push(parsed);
}

function requiresExplicitDebtControl(entry: ClawDebtLedgerEntry): boolean {
  return entry.canonicalSource.includes("baseline");
}

function rawDebtControlStrictFailures(repo: string, entry: ClawDebtLedgerEntry, raw: unknown): ClawDebtLedgerAudit["strictFailures"] {
  const failures: ClawDebtLedgerAudit["strictFailures"] = [];
  const record = isRecord(raw) ? raw : {};
  const budget = isRecord(record.budget) ? record.budget : {};
  const releaseEffect = isRecord(record.releaseEffect) ? record.releaseEffect : {};
  const missing: string[] = [];
  for (const field of ["ownerArea", "expiresAt", "severity"]) {
    if (!stringField(record[field])) missing.push(`debtControl.${field}`);
  }
  for (const field of ["metric", "unit", "current", "maxAllowed", "nextMaxAllowed", "target", "cadence"]) {
    const value = budget[field];
    if (typeof value === "undefined" || value === "") missing.push(`debtControl.budget.${field}`);
  }
  for (const field of ["mode", "targets", "gate", "reason"]) {
    const value = releaseEffect[field];
    if (field === "targets") {
      if (!Array.isArray(value)) missing.push("debtControl.releaseEffect.targets");
    } else if (!stringField(value)) {
      missing.push(`debtControl.releaseEffect.${field}`);
    }
  }
  if (missing.length > 0) {
    failures.push({
      repo,
      id: entry.id,
      sourceType: entry.sourceType,
      canonicalSource: entry.canonicalSource,
      severity: entry.debtControl.severity,
      reason: `debtControl declaration is missing ${missing.join(", ")}`,
    });
  }
  return failures;
}

function normalizeDebtControl(raw: unknown, fallback: DebtControlFallback): ClawDebtControl {
  const record = isRecord(raw) ? raw : {};
  const budget = isRecord(record.budget) ? record.budget : {};
  const releaseEffect = isRecord(record.releaseEffect) ? record.releaseEffect : {};
  const current = numberField(budget.current) ?? fallback.current;
  const maxAllowed = numberField(budget.maxAllowed) ?? fallback.maxAllowed ?? current;
  const nextMaxAllowed = numberField(budget.nextMaxAllowed) ?? fallback.nextMaxAllowed ?? Math.max(0, maxAllowed - 1);
  const target = numberField(budget.target) ?? fallback.target ?? Math.min(nextMaxAllowed, maxAllowed);
  return clawDebtControlSchema.parse({
    ownerArea: stringField(record.ownerArea) ?? fallback.ownerArea,
    expiresAt: stringField(record.expiresAt) ?? fallback.expiresAt ?? "2099-12-31",
    severity: parseSeverity(stringField(record.severity), fallback.severity ?? "P2"),
    budget: {
      metric: stringField(budget.metric) ?? fallback.metric,
      unit: stringField(budget.unit) ?? fallback.unit,
      current,
      maxAllowed,
      nextMaxAllowed,
      target,
      cadence: stringField(budget.cadence) ?? fallback.cadence ?? "expiry",
    },
    releaseEffect: {
      mode: parseReleaseEffect(stringField(releaseEffect.mode), fallback.releaseEffectMode ?? "blocks_growth"),
      targets: stringArray(releaseEffect.targets).length > 0 ? stringArray(releaseEffect.targets) : fallback.releaseTargets ?? [],
      gate: stringField(releaseEffect.gate) ?? fallback.releaseGate ?? "claw debt audit --strict",
      reason: stringField(releaseEffect.reason) ?? fallback.releaseReason ?? "Debt baseline must shrink or block growth.",
    },
  });
}

function collectStrictDebtControlFailures(entries: ClawDebtLedgerEntry[], generatedAt: string): ClawDebtLedgerAudit["strictFailures"] {
  const failures: ClawDebtLedgerAudit["strictFailures"] = [];
  for (const entry of entries) {
    const control = entry.debtControl;
    const label = {
      repo: entry.repo,
      id: entry.id,
      sourceType: entry.sourceType,
      canonicalSource: entry.canonicalSource,
      severity: control.severity,
    };
    if (control.expiresAt < generatedAt.slice(0, 10)) {
      failures.push({ ...label, reason: `debtControl expired on ${control.expiresAt}` });
    }
    if (control.budget.nextMaxAllowed >= control.budget.maxAllowed) {
      failures.push({ ...label, reason: "debtControl budget.nextMaxAllowed must be lower than budget.maxAllowed" });
    }
    if ((control.severity === "P0" || control.severity === "P1") && !["blocks_release", "blocks_growth"].includes(control.releaseEffect.mode)) {
      failures.push({ ...label, reason: "P0/P1 debtControl releaseEffect.mode must block release or growth" });
    }
    if (control.releaseEffect.mode === "blocks_release" && control.releaseEffect.targets.length === 0) {
      failures.push({ ...label, reason: "blocks_release debtControl must list release targets" });
    }
  }
  return failures;
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

function fingerprintEntry(repo: string, input: Pick<ClawDebtLedgerEntry, "sourceType" | "classification" | "canonicalSource" | "summary">): string {
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
  if (!entry.debtControl) missing.push("debtControl");
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

function numberField(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0) : [];
}

function parseSeverity(value: string | undefined, fallback: ClawDebtControlSeverity): ClawDebtControlSeverity {
  return (CLAW_DEBT_CONTROL_SEVERITIES as readonly string[]).includes(value ?? "") ? value as ClawDebtControlSeverity : fallback;
}

function parseReleaseEffect(value: string | undefined, fallback: ClawDebtControlReleaseEffect): ClawDebtControlReleaseEffect {
  return (CLAW_DEBT_CONTROL_RELEASE_EFFECTS as readonly string[]).includes(value ?? "") ? value as ClawDebtControlReleaseEffect : fallback;
}

function aggregateEntryCount(entry: Record<string, unknown>): number {
  let total = 0;
  for (const value of Object.values(entry)) {
    if (!isRecord(value)) continue;
    for (const nested of Object.values(value)) {
      if (isRecord(nested) && typeof nested.count === "number" && Number.isFinite(nested.count)) total += nested.count;
    }
  }
  return Math.max(1, total);
}

function compact(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function countTermMatches(text: string, term: string): number {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.match(new RegExp(escaped, "gi"))?.length ?? 0;
}

function containsPrivatePath(value: string): boolean {
  const archivedPrivatePlaybookDir = ["private", "agent", "playbooks"].join("-");
  const codexHomeMarker = ["~", ".codex"].join("/");
  const codexSessionMarker = [".codex", "sessions"].join("/");
  return /\/Users\/[^/\s]+\//.test(value) || value.includes(codexHomeMarker) || value.includes(codexSessionMarker) || value.includes(archivedPrivatePlaybookDir);
}

function redactPrivatePaths(value: string): string {
  return value
    .replace(/\/Users\/[^/\s]+\/[^\s)]+/g, "<private-path>")
    .replace(/~\/\.codex[^\s)]*/g, "<redacted-local-path>");
}
