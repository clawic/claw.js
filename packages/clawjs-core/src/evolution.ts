import { z } from "zod";
import type { ClawCliCommandRegistryEntry } from "./cli-command-registry.ts";
import type { ClawPersistentSurfaceNode } from "./surface-registry.ts";

export const CLAW_EVOLUTION_CHANGE_CLASSES = [
  "additive",
  "compatible",
  "migration_required",
  "adapter_required",
  "breaking_requires_adr",
] as const;

export const CLAW_EVOLUTION_RECORD_STATUSES = [
  "draft",
  "active",
  "superseded",
  "blocked",
  "retired_runtime_adapter",
] as const;

export const clawEvolutionPolicy = {
  schemaVersion: 1,
  sourceOfTruth: "clawjs",
  preV1: "clean_cut_with_explicit_approval",
  postV1Migration: "step_by_step_all_public_versions",
  rescueCore: "launch_chat_repair",
  legacyLocation: "boundary_migrators_adapters_receipts",
  breakingApproval: "adr_required",
  backup: {
    threshold: { maxBytes: 1_073_741_824, maxFiles: 10_000, overrideRequired: true },
    retentionDays: 30,
    externalSources: "read_only_never_mutate_or_copy_wholesale",
  },
  receipts: {
    defaultPrivacy: "redacted",
    externalSubmission: "explicit_approval_only",
  },
  cli: {
    command: "claw evolution",
    subcommands: ["list", "show", "diff", "plan", "dry-run", "apply", "verify", "doctor", "repair", "rollback", "backup", "receipt", "report"],
  },
  ledger: {
    directory: "docs/evolution",
    baseline: "docs/evolution/baseline.json",
    schema: "docs/evolution/schema.json",
    publicSurfaceBaseline: "docs/evolution/public-surface-baseline.json",
  },
} as const;

export const clawEvolutionRecordSchema = z.object({
  id: z.string().regex(/^evo_[a-z0-9_]+$/),
  title: z.string().min(1),
  class: z.enum(CLAW_EVOLUTION_CHANGE_CLASSES),
  status: z.enum(CLAW_EVOLUTION_RECORD_STATUSES),
  owner: z.string().min(1),
  surfaces: z.array(z.string().min(1)).min(1),
  tests: z.array(z.string().min(1)),
  adr: z.string().optional(),
  migration: z.string().optional(),
  adapter: z.string().optional(),
  receipt: z.string().optional(),
  notes: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
});

export const clawEvolutionLedgerSchema = z.object({
  schemaVersion: z.literal(1),
  policy: z.object({
    sourceOfTruth: z.literal("clawjs"),
    postV1Migration: z.literal("step_by_step_all_public_versions"),
    rescueCore: z.literal("launch_chat_repair"),
  }).passthrough(),
  records: z.array(clawEvolutionRecordSchema),
});

export const clawEvolutionBaselineSurfaceSchema = z.object({
  id: z.string().min(1),
  owner: z.string().optional(),
  kind: z.string().optional(),
  parentId: z.string().optional(),
  path: z.string().optional(),
  value: z.string().optional(),
  surfaceClass: z.string().optional(),
  stability: z.string().optional(),
});

export const clawEvolutionBaselineCliCommandSchema = z.object({
  name: z.string().min(1),
  kind: z.string().min(1),
  target: z.string().optional(),
  usage: z.string().optional(),
  family: z.string().optional(),
  advanced: z.boolean().optional(),
  schemaVersion: z.number(),
  jsonSchemaId: z.string().min(1),
});

export const clawEvolutionPublicSurfaceBaselineSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string(),
  sources: z.object({
    surfaces: z.literal("packages/clawjs-core/src/surface-registry.ts"),
    cliCommands: z.literal("packages/clawjs-core/src/cli-command-registry.ts"),
  }),
  counts: z.object({
    surfaces: z.number(),
    cliCommands: z.number(),
  }),
  fingerprints: z.object({
    surfaces: z.string(),
    cliCommands: z.string(),
    combined: z.string(),
  }),
  surfaces: z.array(clawEvolutionBaselineSurfaceSchema),
  cliCommands: z.array(clawEvolutionBaselineCliCommandSchema),
});

export const clawEvolutionBaselineChangeSchema = z.object({
  area: z.enum(["surface", "cliCommand"]),
  change: z.enum(["added", "removed", "changed"]),
  id: z.string(),
  coveredByRecord: z.boolean(),
  recordIds: z.array(z.string()),
});

export const clawEvolutionOperatorActionSchema = z.enum(["plan", "dry-run", "apply", "repair", "rollback", "backup", "receipt", "report"]);

export const clawEvolutionBackupPolicySchema = z.object({
  surface: z.string().min(1),
  strategy: z.enum([
    "snapshot_before_mutation",
    "touched_objects_metadata",
    "rebuildable_no_canonical_backup",
    "external_read_only",
  ]),
  requiresApproval: z.boolean(),
  maxBytesBeforeOverride: z.number(),
  retentionDays: z.number(),
  rationale: z.string().min(1),
});

export const clawEvolutionOperatorStepSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  kind: z.enum(["read", "classify", "backup", "migrate", "adapter", "verify", "receipt", "rescue"]),
  status: z.enum(["planned", "approval_gated", "blocked", "external_pending"]),
  surfaces: z.array(z.string()),
  requiresApproval: z.boolean(),
  notes: z.array(z.string()),
});

export const clawEvolutionOperatorPlanSchema = z.object({
  schemaVersion: z.literal(1),
  action: clawEvolutionOperatorActionSchema,
  status: z.enum(["dry_run_ready", "approval_gated_plan", "blocked"]),
  mutates: z.boolean(),
  requiresApproval: z.boolean(),
  fromVersion: z.string(),
  toVersion: z.string(),
  rescueCore: z.literal("launch_chat_repair"),
  ledgerPath: z.string().optional(),
  touchedSurfaces: z.array(z.string()),
  backupPolicies: z.array(clawEvolutionBackupPolicySchema),
  steps: z.array(clawEvolutionOperatorStepSchema),
});

export const clawEvolutionReceiptSchema = z.object({
  schemaVersion: z.literal(1),
  receiptId: z.string().min(1),
  createdAt: z.string(),
  action: clawEvolutionOperatorActionSchema,
  status: z.enum(["planned", "completed", "failed", "blocked"]),
  surfaces: z.array(z.string()),
  planStatus: z.enum(["dry_run_ready", "approval_gated_plan", "blocked"]),
  redaction: z.object({
    privacy: z.literal("redacted"),
    promptsIncluded: z.literal(false),
    secretsIncluded: z.literal(false),
    fullLocalPathsIncluded: z.literal(false),
    externalSubmission: z.literal("explicit_approval_only"),
  }),
  notes: z.array(z.string()),
  errors: z.array(z.string()),
});

export const clawEvolutionFixtureSurfaceSchema = z.object({
  id: z.string().min(1),
  kind: z.enum([
    "database",
    "workspace_file",
    "global_file",
    "protocol",
    "cli_json",
    "package_export",
    "agent_instruction",
    "skill",
    "route",
    "schema",
    "backup",
    "search_index",
    "permission",
    "audit",
    "rescue",
  ]),
  owner: z.string().min(1),
  backupStrategy: clawEvolutionBackupPolicySchema.shape.strategy,
  payload: z.record(z.string(), z.unknown()),
  expectedCurrent: z.record(z.string(), z.unknown()),
});

export const clawEvolutionVersionFixtureSchema = z.object({
  schemaVersion: z.literal(1),
  fixtureId: z.string().regex(/^evo_fixture_[a-z0-9_]+$/),
  publicVersion: z.string().min(1),
  createdAt: z.string(),
  phase: z.enum(["pre_v1_foundation", "public_release"]),
  rescueCore: z.literal("launch_chat_repair"),
  surfaces: z.array(clawEvolutionFixtureSurfaceSchema).min(1),
  notes: z.array(z.string()),
});

export const clawEvolutionMigratorLabResultSchema = z.object({
  schemaVersion: z.literal(1),
  status: z.enum(["pass", "fail", "blocked"]),
  fromVersion: z.string(),
  toVersion: z.string(),
  fixtureIds: z.array(z.string()),
  fixtureCount: z.number(),
  checkedSurfaces: z.array(z.string()),
  checks: z.array(z.object({
    id: z.string().min(1),
    status: z.enum(["pass", "fail", "blocked"]),
    notes: z.array(z.string()),
  })),
  receipts: z.array(clawEvolutionReceiptSchema),
});

export type ClawEvolutionPolicy = typeof clawEvolutionPolicy;
export type ClawEvolutionRecord = z.infer<typeof clawEvolutionRecordSchema>;
export type ClawEvolutionLedger = z.infer<typeof clawEvolutionLedgerSchema>;
export type ClawEvolutionBaselineSurface = z.infer<typeof clawEvolutionBaselineSurfaceSchema>;
export type ClawEvolutionBaselineCliCommand = z.infer<typeof clawEvolutionBaselineCliCommandSchema>;
export type ClawEvolutionPublicSurfaceBaseline = z.infer<typeof clawEvolutionPublicSurfaceBaselineSchema>;
export type ClawEvolutionBaselineChange = z.infer<typeof clawEvolutionBaselineChangeSchema>;
export type ClawEvolutionOperatorAction = z.infer<typeof clawEvolutionOperatorActionSchema>;
export type ClawEvolutionBackupPolicy = z.infer<typeof clawEvolutionBackupPolicySchema>;
export type ClawEvolutionOperatorStep = z.infer<typeof clawEvolutionOperatorStepSchema>;
export type ClawEvolutionOperatorPlan = z.infer<typeof clawEvolutionOperatorPlanSchema>;
export type ClawEvolutionReceipt = z.infer<typeof clawEvolutionReceiptSchema>;
export type ClawEvolutionFixtureSurface = z.infer<typeof clawEvolutionFixtureSurfaceSchema>;
export type ClawEvolutionVersionFixture = z.infer<typeof clawEvolutionVersionFixtureSchema>;
export type ClawEvolutionMigratorLabResult = z.infer<typeof clawEvolutionMigratorLabResultSchema>;

export function createEvolutionPublicSurfaceBaseline(input: {
  generatedAt: string;
  surfaces: ClawPersistentSurfaceNode[];
  cliCommands: ClawCliCommandRegistryEntry[];
}): ClawEvolutionPublicSurfaceBaseline {
  const surfaces = input.surfaces.map(toEvolutionBaselineSurface).sort((a, b) => a.id.localeCompare(b.id));
  const cliCommands = input.cliCommands.map(toEvolutionBaselineCliCommand).sort((a, b) => a.name.localeCompare(b.name));
  const surfaceFingerprint = stableFingerprint(surfaces);
  const cliFingerprint = stableFingerprint(cliCommands);
  return {
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    sources: {
      surfaces: "packages/clawjs-core/src/surface-registry.ts",
      cliCommands: "packages/clawjs-core/src/cli-command-registry.ts",
    },
    counts: {
      surfaces: surfaces.length,
      cliCommands: cliCommands.length,
    },
    fingerprints: {
      surfaces: surfaceFingerprint,
      cliCommands: cliFingerprint,
      combined: stableFingerprint([surfaceFingerprint, cliFingerprint]),
    },
    surfaces,
    cliCommands,
  };
}

export function diffEvolutionPublicSurfaceBaseline(input: {
  baseline: ClawEvolutionPublicSurfaceBaseline;
  current: ClawEvolutionPublicSurfaceBaseline;
  ledger: ClawEvolutionLedger;
}): {
  status: "unchanged" | "changed";
  changes: ClawEvolutionBaselineChange[];
  uncoveredChanges: ClawEvolutionBaselineChange[];
  summary: { changed: number; uncovered: number };
} {
  const surfaceChanges = diffById({
    area: "surface",
    baseline: input.baseline.surfaces,
    current: input.current.surfaces,
    getId: (entry) => entry.id,
    ledger: input.ledger,
  });
  const cliCommandChanges = diffById({
    area: "cliCommand",
    baseline: input.baseline.cliCommands,
    current: input.current.cliCommands,
    getId: (entry) => `claw.cli.command.${entry.name}`,
    ledger: input.ledger,
  });
  const changes = [...surfaceChanges, ...cliCommandChanges];
  const uncoveredChanges = changes.filter((change) => !change.coveredByRecord);
  return {
    status: changes.length === 0 ? "unchanged" : "changed",
    changes,
    uncoveredChanges,
    summary: {
      changed: changes.length,
      uncovered: uncoveredChanges.length,
    },
  };
}

export function summarizeEvolutionLedger(ledger: ClawEvolutionLedger): {
  records: number;
  active: number;
  blocked: number;
  migrationRequired: number;
  adapterRequired: number;
  breakingRequiresAdr: number;
} {
  return {
    records: ledger.records.length,
    active: ledger.records.filter((record) => record.status === "active").length,
    blocked: ledger.records.filter((record) => record.status === "blocked").length,
    migrationRequired: ledger.records.filter((record) => record.class === "migration_required").length,
    adapterRequired: ledger.records.filter((record) => record.class === "adapter_required").length,
    breakingRequiresAdr: ledger.records.filter((record) => record.class === "breaking_requires_adr").length,
  };
}

export function createEvolutionOperatorPlan(input: {
  action: ClawEvolutionOperatorAction;
  ledger: ClawEvolutionLedger;
  ledgerPath?: string;
  changes?: ClawEvolutionBaselineChange[];
  fromVersion?: string;
  toVersion?: string;
}): ClawEvolutionOperatorPlan {
  const touchedSurfaces = resolveTouchedEvolutionSurfaces(input.ledger, input.changes);
  const mutates = ["apply", "repair", "rollback", "backup"].includes(input.action);
  const requiresApproval = mutates || input.action === "report";
  const status = requiresApproval ? "approval_gated_plan" : "dry_run_ready";
  const backupPolicies = touchedSurfaces.map((surface) => classifyEvolutionBackupPolicy(surface, { requiresApproval: mutates }));
  const steps: ClawEvolutionOperatorStep[] = [
    {
      id: "read_evolution_ledger",
      title: "Read evolution ledger and public surface baseline",
      kind: "read",
      status: "planned",
      surfaces: [],
      requiresApproval: false,
      notes: ["Use ClawJS as the source of truth for public evolution contracts."],
    },
    {
      id: "classify_touched_surfaces",
      title: "Classify every touched surface before changing data",
      kind: "classify",
      status: "planned",
      surfaces: touchedSurfaces,
      requiresApproval: false,
      notes: ["No stable public surface change should pass without an active evolution record."],
    },
    {
      id: "prepare_best_effort_backup",
      title: "Prepare backup policy before any mutation",
      kind: "backup",
      status: mutates ? "approval_gated" : "planned",
      surfaces: touchedSurfaces,
      requiresApproval: mutates,
      notes: ["External/provider sources remain read-only; rebuildable indexes do not become canonical backup sources."],
    },
    {
      id: "preserve_launch_chat_repair",
      title: "Keep launch, chat, and repair path available first",
      kind: "rescue",
      status: "planned",
      surfaces: ["claw.rescue.launch_chat_repair"],
      requiresApproval: false,
      notes: ["Migration work must degrade optional UI before blocking the user from talking to the agent."],
    },
    {
      id: "write_redacted_receipt",
      title: "Write redacted migration or repair receipt",
      kind: "receipt",
      status: "planned",
      surfaces: touchedSurfaces,
      requiresApproval: false,
      notes: ["Receipts must exclude prompts, secrets, and full local paths by default."],
    },
  ];
  return clawEvolutionOperatorPlanSchema.parse(stripUndefined({
    schemaVersion: 1,
    action: input.action,
    status,
    mutates,
    requiresApproval,
    fromVersion: input.fromVersion ?? "current",
    toVersion: input.toVersion ?? "current",
    rescueCore: "launch_chat_repair",
    ledgerPath: input.ledgerPath,
    touchedSurfaces,
    backupPolicies,
    steps,
  }));
}

export function classifyEvolutionBackupPolicy(surface: string, options: { requiresApproval?: boolean } = {}): ClawEvolutionBackupPolicy {
  const normalized = surface.toLowerCase();
  if (/\b(external|provider|remote|codex|webhook)\b/.test(normalized)) {
    return buildBackupPolicy(surface, "external_read_only", options.requiresApproval ?? false, "External/provider data must be inspected read-only and never copied wholesale.");
  }
  if (/\b(search|index|cache|logs?|telemetry)\b/.test(normalized)) {
    return buildBackupPolicy(surface, "rebuildable_no_canonical_backup", options.requiresApproval ?? false, "Rebuildable derived data should be regenerated from canonical sources.");
  }
  if (/\b(database|db|sqlite|schema|storage|collection|record)\b/.test(normalized)) {
    return buildBackupPolicy(surface, "snapshot_before_mutation", options.requiresApproval ?? false, "Canonical local data needs a snapshot before mutation.");
  }
  return buildBackupPolicy(surface, "touched_objects_metadata", options.requiresApproval ?? false, "Default to metadata for touched objects so repair agents know what changed without polluting main code.");
}

export function createEvolutionReceipt(input: {
  action: ClawEvolutionOperatorAction;
  plan: ClawEvolutionOperatorPlan;
  status?: "planned" | "completed" | "failed" | "blocked";
  createdAt?: string;
  notes?: string[];
  errors?: string[];
}): ClawEvolutionReceipt {
  const createdAt = input.createdAt ?? "CURRENT";
  const notes = (input.notes ?? []).map(redactEvolutionReceiptText);
  const errors = (input.errors ?? []).map(redactEvolutionReceiptText);
  const receiptId = `evo_receipt_${stableFingerprint({
    action: input.action,
    createdAt,
    surfaces: input.plan.touchedSurfaces,
    status: input.status ?? "planned",
  }).replace(/[^a-z0-9]/g, "_")}`;
  return clawEvolutionReceiptSchema.parse({
    schemaVersion: 1,
    receiptId,
    createdAt,
    action: input.action,
    status: input.status ?? "planned",
    surfaces: input.plan.touchedSurfaces,
    planStatus: input.plan.status,
    redaction: {
      privacy: "redacted",
      promptsIncluded: false,
      secretsIncluded: false,
      fullLocalPathsIncluded: false,
      externalSubmission: "explicit_approval_only",
    },
    notes,
    errors,
  });
}

export function runEvolutionMigratorLab(input: {
  fixtures: ClawEvolutionVersionFixture[];
  ledger: ClawEvolutionLedger;
  fromVersion?: string;
  toVersion?: string;
  createdAt?: string;
}): ClawEvolutionMigratorLabResult {
  const fixtures = input.fixtures.map((fixture) => clawEvolutionVersionFixtureSchema.parse(fixture));
  const fromVersion = input.fromVersion ?? fixtures[0]?.publicVersion ?? "unknown";
  const toVersion = input.toVersion ?? "current";
  const checkedSurfaces = [...new Set(fixtures.flatMap((fixture) => fixture.surfaces.map((surface) => surface.id)))].sort();
  const plan = createEvolutionOperatorPlan({
    action: "dry-run",
    ledger: input.ledger,
    changes: checkedSurfaces.map((surface) => ({
      area: "surface",
      change: "changed",
      id: surface,
      coveredByRecord: true,
      recordIds: [],
    })),
    fromVersion,
    toVersion,
  });
  const checks = [
    checkEvolutionLab(fixtures.length > 0, "fixtures_present", "At least one version fixture must be available."),
    checkEvolutionLab(fixtures.every((fixture) => fixture.rescueCore === "launch_chat_repair"), "rescue_core_fixture", "Fixtures preserve launch/chat/repair as survival core."),
    checkEvolutionLab(hasRequiredFixtureKinds(fixtures), "required_surface_kinds", "Foundation fixtures cover DB, workspace, protocol, CLI JSON, package export, skills, search, permissions, audit, backup, and rescue."),
    checkEvolutionLab(input.ledger.policy.sourceOfTruth === "clawjs", "ledger_source_of_truth", "Migration lab must use the ClawJS ledger as canon."),
    checkEvolutionLab(input.ledger.policy.postV1Migration === "step_by_step_all_public_versions", "step_by_step_policy", "Post-V1 migrations must chain through public versions."),
  ];
  const status = checks.some((check) => check.status === "fail")
    ? "fail"
    : checks.some((check) => check.status === "blocked")
      ? "blocked"
      : "pass";
  return clawEvolutionMigratorLabResultSchema.parse({
    schemaVersion: 1,
    status,
    fromVersion,
    toVersion,
    fixtureIds: fixtures.map((fixture) => fixture.fixtureId),
    fixtureCount: fixtures.length,
    checkedSurfaces,
    checks,
    receipts: [createEvolutionReceipt({
      action: "dry-run",
      plan,
      status: status === "pass" ? "completed" : "failed",
      createdAt: input.createdAt,
      notes: [`migration lab ${status} for ${fromVersion} to ${toVersion}`],
    })],
  });
}

export function redactEvolutionReceiptText(text: string): string {
  return text
    .replace(/\/Users\/[^\s"'`]+/g, "[redacted_path]")
    .replace(/\b(?:sk|pk|rk|ghp|github_pat|xox[baprs])-[A-Za-z0-9_\-]{8,}\b/g, "[redacted_secret]")
    .replace(/\b(prompt|input|message)\s*[:=]\s*("[^"]*"|'[^']*'|[^\n\r;]+)/gi, "$1: [redacted_prompt]");
}

function checkEvolutionLab(condition: boolean, id: string, note: string): ClawEvolutionMigratorLabResult["checks"][number] {
  return { id, status: condition ? "pass" : "fail", notes: [note] };
}

function hasRequiredFixtureKinds(fixtures: ClawEvolutionVersionFixture[]): boolean {
  const kinds = new Set(fixtures.flatMap((fixture) => fixture.surfaces.map((surface) => surface.kind)));
  return [
    "database",
    "workspace_file",
    "global_file",
    "protocol",
    "cli_json",
    "package_export",
    "agent_instruction",
    "skill",
    "route",
    "schema",
    "backup",
    "search_index",
    "permission",
    "audit",
    "rescue",
  ].every((kind) => kinds.has(kind as ClawEvolutionFixtureSurface["kind"]));
}

function toEvolutionBaselineSurface(node: ClawPersistentSurfaceNode): ClawEvolutionBaselineSurface {
  return stripUndefined({
    id: node.id,
    owner: node.owner,
    kind: node.kind,
    parentId: node.parentId,
    path: node.path,
    value: typeof node.value === "string" ? node.value : undefined,
    surfaceClass: node.surfaceClass,
    stability: node.stability,
  });
}

function toEvolutionBaselineCliCommand(command: ClawCliCommandRegistryEntry): ClawEvolutionBaselineCliCommand {
  return stripUndefined({
    name: command.name,
    kind: command.kind,
    target: command.target,
    usage: command.usage,
    family: command.family,
    advanced: command.advanced,
    schemaVersion: command.schemaVersion,
    jsonSchemaId: command.jsonSchemaId,
  });
}

function diffById<T>(input: {
  area: "surface" | "cliCommand";
  baseline: T[];
  current: T[];
  getId: (entry: T) => string;
  ledger: ClawEvolutionLedger;
}): ClawEvolutionBaselineChange[] {
  const baseline = new Map(input.baseline.map((entry) => [input.getId(entry), entry]));
  const current = new Map(input.current.map((entry) => [input.getId(entry), entry]));
  const ids = [...new Set([...baseline.keys(), ...current.keys()])].sort();
  const changes: ClawEvolutionBaselineChange[] = [];
  for (const id of ids) {
    const before = baseline.get(id);
    const after = current.get(id);
    if (!before && after) changes.push(buildBaselineChange(input.area, "added", id, input.ledger));
    else if (before && !after) changes.push(buildBaselineChange(input.area, "removed", id, input.ledger));
    else if (before && after && stableStringify(before) !== stableStringify(after)) {
      changes.push(buildBaselineChange(input.area, "changed", id, input.ledger));
    }
  }
  return changes;
}

function buildBaselineChange(area: "surface" | "cliCommand", change: "added" | "removed" | "changed", id: string, ledger: ClawEvolutionLedger): ClawEvolutionBaselineChange {
  const recordIds = ledger.records
    .filter((record) => record.status === "active")
    .filter((record) => record.surfaces.includes(id) || record.surfaces.includes("*"))
    .map((record) => record.id)
    .sort();
  return { area, change, id, coveredByRecord: recordIds.length > 0, recordIds };
}

function resolveTouchedEvolutionSurfaces(ledger: ClawEvolutionLedger, changes: ClawEvolutionBaselineChange[] | undefined): string[] {
  const fromChanges = changes?.map((change) => change.id) ?? [];
  const fromLedger = ledger.records
    .filter((record) => record.status === "active")
    .flatMap((record) => record.surfaces)
    .filter((surface) => surface !== "*");
  const surfaces = [...new Set([...fromChanges, ...fromLedger])].sort();
  return surfaces.length > 0 ? surfaces : ["claw.evolution.unknown_surface"];
}

function buildBackupPolicy(
  surface: string,
  strategy: ClawEvolutionBackupPolicy["strategy"],
  requiresApproval: boolean,
  rationale: string,
): ClawEvolutionBackupPolicy {
  return {
    surface,
    strategy,
    requiresApproval,
    maxBytesBeforeOverride: clawEvolutionPolicy.backup.threshold.maxBytes,
    retentionDays: clawEvolutionPolicy.backup.retentionDays,
    rationale,
  };
}

function stableFingerprint(value: unknown): string {
  let hash = 0x811c9dc5;
  const text = stableStringify(value);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}
