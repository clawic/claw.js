import { z } from "zod";

export const portableArchiveSchemaVersion = 1;

export const portableArchiveManifestSchemaId = "claw.portableArchive.manifest.v1";
export const portableArchivePlanSchemaId = "claw.portableArchive.plan.v1";
export const portableArchiveVerificationReportSchemaId = "claw.portableArchive.verificationReport.v1";
export const portableArchiveImportPreviewSchemaId = "claw.portableArchive.importPreview.v1";
export const portableArchiveRestoreReportSchemaId = "claw.portableArchive.restoreReport.v1";

export const PORTABLE_ARCHIVE_CLI_COMMAND = "claw archive";
export const PORTABLE_ARCHIVE_BACKUP_EXTENSION = ".clawbackup";
export const PORTABLE_ARCHIVE_EXPORT_EXTENSION = ".clawexport";
export const PORTABLE_ARCHIVE_SECRETS_EXTENSION = ".clawsecrets";
export const PORTABLE_ARCHIVE_MANIFEST_PATH = "manifest.json";

export const portableArchiveStorageClasses = [
  "framework_global",
  "workspace",
  "host_operational",
  "external_reference",
  "rebuildable",
] as const;

export const portableArchiveInventoryKinds = [
  "core_database",
  "sidecar_database",
  "workspace_state",
  "skill",
  "instruction",
  "memory",
  "session",
  "file_blob",
  "audit_metadata",
  "policy",
  "grant",
  "project_manifest",
  "secrets_envelope",
  "external_reference",
  "rebuildable_cache",
] as const;

export const portableArchiveRestoreStrategies = [
  "restore_snapshot",
  "restore_jsonl",
  "restore_file",
  "restore_secrets_envelope",
  "reference_external",
  "rebuild_from_canonical",
] as const;

export const portableArchiveStatuses = [
  "ready",
  "verification_failed",
  "requires_signed_host",
  "requires_approval",
  "restore_blocked",
  "restore_complete",
] as const;

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

export const portableArchiveHashSchema = z.object({
  algorithm: z.literal("sha256"),
  value: sha256Schema,
});

export const portableArchiveInventoryEntrySchema = z.object({
  id: z.string().min(1),
  kind: z.enum(portableArchiveInventoryKinds),
  storageClass: z.enum(portableArchiveStorageClasses),
  sourcePath: z.string().min(1),
  portablePath: z.string().min(1),
  format: z.string().min(1),
  canonical: z.boolean(),
  hash: portableArchiveHashSchema.optional(),
  bytes: z.number().int().nonnegative().optional(),
  recordCount: z.number().int().nonnegative().optional(),
  restoreStrategy: z.enum(portableArchiveRestoreStrategies),
  secretHandling: z.enum(["none", "encrypted_envelope", "opaque_reference", "redacted"]),
  notes: z.string().optional(),
});

export const portableArchiveExternalSourceSchema = z.object({
  id: z.string().min(1),
  sourceKind: z.enum(["external_read_only", "local_mirror"]),
  provenance: z.string().min(1),
  syncCursor: z.string().optional(),
  copied: z.boolean(),
  policy: z.enum(["reference_only", "local_mirror_included"]),
});

export const portableArchiveManifestV1Schema = z.object({
  schemaVersion: z.literal(portableArchiveSchemaVersion),
  schemaId: z.literal(portableArchiveManifestSchemaId),
  archiveKind: z.literal("claw_portable_archive"),
  format: z.literal(PORTABLE_ARCHIVE_BACKUP_EXTENSION),
  manifestPath: z.literal(PORTABLE_ARCHIVE_MANIFEST_PATH),
  createdAt: z.string().min(1),
  createdBy: z.object({
    product: z.literal("claw"),
    command: z.literal(PORTABLE_ARCHIVE_CLI_COMMAND),
  }),
  compatibility: z.object({
    minClawSchemaVersion: z.number().int().positive(),
    maxClawSchemaVersion: z.number().int().positive(),
    restoreRequiresPreview: z.literal(true),
  }),
  source: z.object({
    clawHomeFingerprint: z.string().min(1),
    sourceVersion: z.string().min(1),
    host: z.enum(["clawjs", "clawix_signed_host", "other_signed_host"]),
  }),
  counts: z.object({
    inventoryEntries: z.number().int().nonnegative(),
    canonicalEntries: z.number().int().nonnegative(),
    externalReferences: z.number().int().nonnegative(),
    rebuildableExcluded: z.number().int().nonnegative(),
    secretsEnvelopes: z.number().int().nonnegative(),
  }),
  inventory: z.array(portableArchiveInventoryEntrySchema),
  restoreGraph: z.array(z.object({
    id: z.string().min(1),
    after: z.array(z.string().min(1)),
  })),
  externalSources: z.array(portableArchiveExternalSourceSchema),
  secrets: z.object({
    mode: z.enum(["none", "encrypted_clawsecrets"]),
    envelopePath: z.string().optional(),
    requiresIndependentPassphrase: z.boolean(),
    requiresSignedHost: z.boolean(),
    forbiddenPlaintext: z.array(z.string().min(1)),
  }),
  receipts: z.object({
    redaction: z.literal("redacted"),
    entries: z.array(z.object({
      id: z.string().min(1),
      receiptPath: z.string().min(1),
      hash: portableArchiveHashSchema,
    })),
  }),
});

export const portableArchivePlanSchema = z.object({
  schemaVersion: z.literal(portableArchiveSchemaVersion),
  schemaId: z.literal(portableArchivePlanSchemaId),
  status: z.enum(portableArchiveStatuses),
  sourceRoot: z.string().min(1),
  targetFormat: z.literal(PORTABLE_ARCHIVE_BACKUP_EXTENSION),
  includeSecrets: z.boolean(),
  requiresSignedHost: z.boolean(),
  steps: z.array(z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    status: z.enum(["ready", "excluded", "requires_signed_host"]),
    reason: z.string().optional(),
  })),
  expectedManifest: portableArchiveManifestV1Schema,
});

export const portableArchiveVerificationReportSchema = z.object({
  schemaVersion: z.literal(portableArchiveSchemaVersion),
  schemaId: z.literal(portableArchiveVerificationReportSchemaId),
  status: z.enum(["ok", "failed"]),
  manifestId: z.string().min(1),
  checkedAt: z.string().min(1),
  counts: z.object({
    entries: z.number().int().nonnegative(),
    missingHashes: z.number().int().nonnegative(),
    plaintextSecretFindings: z.number().int().nonnegative(),
    externalCopyViolations: z.number().int().nonnegative(),
  }),
  issues: z.array(z.object({
    code: z.string().min(1),
    severity: z.enum(["error", "warning"]),
    message: z.string().min(1),
    path: z.string().optional(),
  })),
});

export const portableArchiveImportPreviewSchema = z.object({
  schemaVersion: z.literal(portableArchiveSchemaVersion),
  schemaId: z.literal(portableArchiveImportPreviewSchemaId),
  status: z.enum(portableArchiveStatuses),
  targetRoot: z.string().min(1),
  canRestore: z.boolean(),
  requiresSignedHost: z.boolean(),
  blockedReasons: z.array(z.string().min(1)),
  mappedCounts: z.object({
    records: z.number().int().nonnegative(),
    files: z.number().int().nonnegative(),
    grants: z.number().int().nonnegative(),
    policies: z.number().int().nonnegative(),
    secretsEnvelopes: z.number().int().nonnegative(),
  }),
  verification: portableArchiveVerificationReportSchema,
});

export const portableArchiveRestoreReportSchema = z.object({
  schemaVersion: z.literal(portableArchiveSchemaVersion),
  schemaId: z.literal(portableArchiveRestoreReportSchemaId),
  status: z.enum(portableArchiveStatuses),
  targetRoot: z.string().min(1),
  approved: z.boolean(),
  appliedAt: z.string().optional(),
  restoredCounts: z.object({
    records: z.number().int().nonnegative(),
    files: z.number().int().nonnegative(),
    grants: z.number().int().nonnegative(),
    policies: z.number().int().nonnegative(),
    secretsEnvelopes: z.number().int().nonnegative(),
  }),
  blockedReasons: z.array(z.string().min(1)),
});

export type PortableArchiveManifestV1 = z.infer<typeof portableArchiveManifestV1Schema>;
export type PortableArchivePlan = z.infer<typeof portableArchivePlanSchema>;
export type PortableArchiveVerificationReport = z.infer<typeof portableArchiveVerificationReportSchema>;
export type PortableArchiveImportPreview = z.infer<typeof portableArchiveImportPreviewSchema>;
export type PortableArchiveRestoreReport = z.infer<typeof portableArchiveRestoreReportSchema>;

export interface PortableArchivePlanInput {
  sourceRoot?: string;
  includeSecrets?: boolean;
  requestedAt?: string;
}

export interface PortableArchivePreviewInput {
  manifest: PortableArchiveManifestV1;
  targetRoot: string;
  signedHostAvailable?: boolean;
  checkedAt?: string;
}

export function createPortableArchiveManifestFixture(input: PortableArchivePlanInput = {}): PortableArchiveManifestV1 {
  const includeSecrets = input.includeSecrets ?? true;
  const inventory: PortableArchiveManifestV1["inventory"] = [
    canonicalEntry("core.sqlite", "core_database", "framework_global", "data/core.sqlite", "sqlite", 42, "restore_snapshot"),
    canonicalEntry("core-jsonl", "core_database", "framework_global", "portable/core/*.jsonl", "jsonl", 42, "restore_jsonl"),
    canonicalEntry("workspace-state", "workspace_state", "workspace", ".claw/", "ordinary_files", 7, "restore_file"),
    canonicalEntry("project-manifests", "project_manifest", "workspace", "projects/*/.claw/project.json", "json", 3, "restore_file"),
    canonicalEntry("skills", "skill", "framework_global", "skills/", "ordinary_files", 5, "restore_file"),
    canonicalEntry("instructions", "instruction", "framework_global", "instructions/", "markdown", 4, "restore_file"),
    canonicalEntry("sessions", "session", "framework_global", "sessions/*.jsonl", "jsonl", 9, "restore_jsonl"),
    canonicalEntry("audit", "audit_metadata", "framework_global", "audit/*.jsonl", "jsonl", 12, "restore_jsonl"),
    canonicalEntry("policies", "policy", "framework_global", "policies/*.json", "json", 2, "restore_file"),
    canonicalEntry("grants", "grant", "framework_global", "grants/*.jsonl", "jsonl", 2, "restore_jsonl"),
    {
      id: "search-index",
      kind: "rebuildable_cache",
      storageClass: "rebuildable",
      sourcePath: "search/index/",
      portablePath: "excluded/search-index.receipt.json",
      format: "receipt",
      canonical: false,
      restoreStrategy: "rebuild_from_canonical",
      secretHandling: "none",
      notes: "rebuildable_no_canonical_backup",
    },
    {
      id: "external-codex",
      kind: "external_reference",
      storageClass: "external_reference",
      sourcePath: "~/.codex",
      portablePath: "external/codex.reference.json",
      format: "json",
      canonical: false,
      hash: zeroHash(),
      restoreStrategy: "reference_external",
      secretHandling: "redacted",
      notes: "External read-only sources are referenced with provenance and sync metadata.",
    },
  ];
  if (includeSecrets) {
    inventory.push({
      id: "secrets-envelope",
      kind: "secrets_envelope",
      storageClass: "host_operational",
      sourcePath: "host/secrets",
      portablePath: `secrets/user.${PORTABLE_ARCHIVE_SECRETS_EXTENSION}`,
      format: PORTABLE_ARCHIVE_SECRETS_EXTENSION,
      canonical: true,
      hash: zeroHash(),
      bytes: 2048,
      restoreStrategy: "restore_secrets_envelope",
      secretHandling: "encrypted_envelope",
      notes: "Nested encrypted envelope; raw secret values and platform wraps are forbidden.",
    });
  }
  return portableArchiveManifestV1Schema.parse({
    schemaVersion: portableArchiveSchemaVersion,
    schemaId: portableArchiveManifestSchemaId,
    archiveKind: "claw_portable_archive",
    format: PORTABLE_ARCHIVE_BACKUP_EXTENSION,
    manifestPath: PORTABLE_ARCHIVE_MANIFEST_PATH,
    createdAt: input.requestedAt ?? "2026-05-21T00:00:00.000Z",
    createdBy: { product: "claw", command: PORTABLE_ARCHIVE_CLI_COMMAND },
    compatibility: { minClawSchemaVersion: 1, maxClawSchemaVersion: 1, restoreRequiresPreview: true },
    source: { clawHomeFingerprint: "fixture-redacted", sourceVersion: "pre-v1", host: "clawjs" },
    counts: {
      inventoryEntries: inventory.length,
      canonicalEntries: inventory.filter((entry) => entry.canonical).length,
      externalReferences: 1,
      rebuildableExcluded: 1,
      secretsEnvelopes: includeSecrets ? 1 : 0,
    },
    inventory,
    restoreGraph: inventory.map((entry) => ({ id: entry.id, after: entry.kind === "grant" ? ["policies"] : [] })),
    externalSources: [
      {
        id: "external-codex",
        sourceKind: "external_read_only",
        provenance: "codex-local-read-only-source",
        syncCursor: "redacted",
        copied: false,
        policy: "reference_only",
      },
    ],
    secrets: {
      mode: includeSecrets ? "encrypted_clawsecrets" : "none",
      ...(includeSecrets ? { envelopePath: `secrets/user.${PORTABLE_ARCHIVE_SECRETS_EXTENSION}` } : {}),
      requiresIndependentPassphrase: includeSecrets,
      requiresSignedHost: includeSecrets,
      forbiddenPlaintext: [
        "raw Secret Key",
        "platform wrap",
        "Keychain material",
        "active bearer token",
        "grant token",
        "plaintext secret value",
      ],
    },
    receipts: {
      redaction: "redacted",
      entries: [{ id: "archive-plan", receiptPath: "receipts/archive-plan.json", hash: zeroHash() }],
    },
  });
}

export function createPortableArchivePlan(input: PortableArchivePlanInput = {}): PortableArchivePlan {
  const includeSecrets = input.includeSecrets ?? false;
  const manifest = createPortableArchiveManifestFixture({ ...input, includeSecrets });
  return portableArchivePlanSchema.parse({
    schemaVersion: portableArchiveSchemaVersion,
    schemaId: portableArchivePlanSchemaId,
    status: includeSecrets ? "requires_signed_host" : "ready",
    sourceRoot: input.sourceRoot ?? "$CLAW_HOME",
    targetFormat: PORTABLE_ARCHIVE_BACKUP_EXTENSION,
    includeSecrets,
    requiresSignedHost: includeSecrets,
    steps: [
      { id: "inventory", title: "Create deterministic inventory", status: "ready" },
      { id: "hash", title: "Hash canonical entries", status: "ready" },
      { id: "secrets", title: "Create encrypted secrets envelope", status: includeSecrets ? "requires_signed_host" : "excluded", reason: includeSecrets ? "signed host reauthentication required" : "secrets omitted" },
      { id: "external", title: "Reference external read-only sources", status: "ready" },
      { id: "caches", title: "Record rebuildable cache exclusions", status: "excluded", reason: "rebuildable_no_canonical_backup" },
    ],
    expectedManifest: manifest,
  });
}

export function verifyPortableArchiveManifest(manifest: unknown, checkedAt = new Date(0).toISOString()): PortableArchiveVerificationReport {
  const issues: PortableArchiveVerificationReport["issues"] = [];
  const parsed = portableArchiveManifestV1Schema.safeParse(manifest);
  if (!parsed.success) {
    return portableArchiveVerificationReportSchema.parse({
      schemaVersion: portableArchiveSchemaVersion,
      schemaId: portableArchiveVerificationReportSchemaId,
      status: "failed",
      manifestId: "unreadable",
      checkedAt,
      counts: { entries: 0, missingHashes: 0, plaintextSecretFindings: 0, externalCopyViolations: 0 },
      issues: [{ code: "invalid_manifest", severity: "error", message: parsed.error.issues.map((issue) => issue.message).join("; ") }],
    });
  }
  const value = parsed.data;
  for (const entry of value.inventory) {
    if (entry.canonical && !entry.hash) issues.push({ code: "missing_hash", severity: "error", message: `${entry.id} is canonical but has no hash.`, path: entry.portablePath });
    if (entryLooksLikePlaintextSecret(entry)) issues.push({ code: "plaintext_secret", severity: "error", message: `${entry.id} looks like plaintext secret material.`, path: entry.portablePath });
  }
  for (const source of value.externalSources) {
    if (source.sourceKind === "external_read_only" && source.copied) {
      issues.push({ code: "external_source_copied", severity: "error", message: `${source.id} copied an external read-only source without local mirror policy.` });
    }
  }
  const missingHashes = issues.filter((issue) => issue.code === "missing_hash").length;
  const plaintextSecretFindings = issues.filter((issue) => issue.code === "plaintext_secret").length;
  const externalCopyViolations = issues.filter((issue) => issue.code === "external_source_copied").length;
  return portableArchiveVerificationReportSchema.parse({
    schemaVersion: portableArchiveSchemaVersion,
    schemaId: portableArchiveVerificationReportSchemaId,
    status: issues.some((issue) => issue.severity === "error") ? "failed" : "ok",
    manifestId: value.archiveKind,
    checkedAt,
    counts: { entries: value.inventory.length, missingHashes, plaintextSecretFindings, externalCopyViolations },
    issues,
  });
}

export function createPortableArchiveImportPreview(input: PortableArchivePreviewInput): PortableArchiveImportPreview {
  const verification = verifyPortableArchiveManifest(input.manifest, input.checkedAt ?? new Date(0).toISOString());
  const requiresSignedHost = input.manifest.secrets.requiresSignedHost && !input.signedHostAvailable;
  const blockedReasons = [
    ...(verification.status === "ok" ? [] : ["verification_failed"]),
    ...(requiresSignedHost ? ["requires_signed_host"] : []),
  ];
  return portableArchiveImportPreviewSchema.parse({
    schemaVersion: portableArchiveSchemaVersion,
    schemaId: portableArchiveImportPreviewSchemaId,
    status: blockedReasons.includes("verification_failed") ? "verification_failed" : requiresSignedHost ? "requires_signed_host" : "ready",
    targetRoot: input.targetRoot,
    canRestore: blockedReasons.length === 0,
    requiresSignedHost,
    blockedReasons,
    mappedCounts: mappedCountsForManifest(input.manifest),
    verification,
  });
}

export function createPortableArchiveRestoreReport(input: { preview: PortableArchiveImportPreview; approved?: boolean; appliedAt?: string }): PortableArchiveRestoreReport {
  const approved = input.approved ?? false;
  const blockedReasons = [
    ...input.preview.blockedReasons,
    ...(approved ? [] : ["explicit_approval_required"]),
  ];
  return portableArchiveRestoreReportSchema.parse({
    schemaVersion: portableArchiveSchemaVersion,
    schemaId: portableArchiveRestoreReportSchemaId,
    status: blockedReasons.length > 0
      ? input.preview.requiresSignedHost ? "requires_signed_host" : approved ? "restore_blocked" : "requires_approval"
      : "restore_complete",
    targetRoot: input.preview.targetRoot,
    approved,
    ...(blockedReasons.length === 0 ? { appliedAt: input.appliedAt ?? new Date(0).toISOString() } : {}),
    restoredCounts: blockedReasons.length === 0 ? input.preview.mappedCounts : { records: 0, files: 0, grants: 0, policies: 0, secretsEnvelopes: 0 },
    blockedReasons,
  });
}

function canonicalEntry(
  id: string,
  kind: PortableArchiveManifestV1["inventory"][number]["kind"],
  storageClass: PortableArchiveManifestV1["inventory"][number]["storageClass"],
  sourcePath: string,
  format: string,
  recordCount: number,
  restoreStrategy: PortableArchiveManifestV1["inventory"][number]["restoreStrategy"],
): PortableArchiveManifestV1["inventory"][number] {
  return {
    id,
    kind,
    storageClass,
    sourcePath,
    portablePath: sourcePath,
    format,
    canonical: true,
    hash: zeroHash(),
    recordCount,
    restoreStrategy,
    secretHandling: "none",
  };
}

function mappedCountsForManifest(manifest: PortableArchiveManifestV1): PortableArchiveImportPreview["mappedCounts"] {
  return {
    records: manifest.inventory.reduce((sum, entry) => sum + (entry.recordCount ?? 0), 0),
    files: manifest.inventory.filter((entry) => ["workspace_state", "skill", "instruction", "file_blob", "project_manifest"].includes(entry.kind)).length,
    grants: manifest.inventory.filter((entry) => entry.kind === "grant").reduce((sum, entry) => sum + (entry.recordCount ?? 0), 0),
    policies: manifest.inventory.filter((entry) => entry.kind === "policy").reduce((sum, entry) => sum + (entry.recordCount ?? 0), 0),
    secretsEnvelopes: manifest.counts.secretsEnvelopes,
  };
}

function entryLooksLikePlaintextSecret(entry: PortableArchiveManifestV1["inventory"][number]): boolean {
  if (entry.kind === "secrets_envelope" && entry.secretHandling === "encrypted_envelope") return false;
  const text = JSON.stringify(entry);
  return /\b(sk-[A-Za-z0-9._-]{6,}|Bearer\s+[A-Za-z0-9._-]{6,}|plaintext secret|raw Secret Key|Keychain material|platform wrap)\b/i.test(text);
}

function zeroHash(): { algorithm: "sha256"; value: string } {
  return { algorithm: "sha256", value: "0".repeat(64) };
}
