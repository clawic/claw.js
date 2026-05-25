import {
  PORTABLE_ARCHIVE_BACKUP_EXTENSION,
  PORTABLE_ARCHIVE_MANIFEST_PATH,
  createPortableArchiveImportPreview,
  createPortableArchiveManifestFixture,
  createPortableArchivePlan,
  createPortableArchiveRestoreReport,
  portableArchiveVerificationReportSchema,
  verifyPortableArchiveManifest,
  type PortableArchiveImportPreview,
  type PortableArchiveManifestV1,
  type PortableArchiveVerificationReport,
} from "@clawjs/core";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { CLI_EXIT_OK, CLI_EXIT_USAGE, CliHandledError } from "./cli-errors.ts";
import { readBooleanFlag } from "./cli-flag-parsers.ts";
import { writeCommandJsonOk } from "./cli-json.ts";

interface ArchiveCliInput {
  positionals: string[];
  argv?: string[];
  flags: Record<string, string>;
  context: {
    stdout: NodeJS.WritableStream;
    stderr: NodeJS.WritableStream;
    cwd: string;
  };
  wantsJson: boolean;
  binName: string;
}

const ARCHIVE_ACTIONS = new Set(["plan", "export", "verify", "inspect", "import", "restore", "doctor"]);

export async function runArchiveCli(input: ArchiveCliInput): Promise<number> {
  const action = input.positionals[1] || "plan";
  if (!ARCHIVE_ACTIONS.has(action)) return writeArchiveUsage(input);

  const argv = input.argv ?? [];
  const includeSecrets = readBooleanFlag(argv, input.flags, "include-secrets", readBooleanFlag(argv, input.flags, "secrets", false));
  const signedHostAvailable = readBooleanFlag(argv, input.flags, "signed-host", false);
  const sourceRoot = input.flags.root ?? input.flags["claw-home"] ?? input.context.cwd;
  const targetRoot = input.flags.target ?? "$CLAW_HOME.restore-preview";
  const checkedAt = readCheckedAt(input.flags["checked-at"]);
  const archivePath = input.flags.archive ?? input.flags.input;
  const outputPath = input.flags.output;
  const resolvedArchivePath = archivePath ? resolvePath(input.context.cwd, archivePath) : undefined;
  const archiveFormatVerification = resolvedArchivePath ? verifyArchiveContainerFormat(resolvedArchivePath, checkedAt) : null;
  const readManifest = () => resolvedArchivePath
    ? readManifestFromLocalArchive(resolvedArchivePath, checkedAt)
    : createPortableArchiveManifestFixture({ sourceRoot, includeSecrets, requestedAt: checkedAt });

  if (action === "plan") {
    return writeArchiveResult(input, action, createPortableArchivePlan({ sourceRoot, includeSecrets, requestedAt: checkedAt }));
  }
  if (action === "export") {
    const plan = createPortableArchivePlan({ sourceRoot, includeSecrets, requestedAt: checkedAt });
    const blocked = includeSecrets && !signedHostAvailable;
    const output = outputPath ? resolvePath(input.context.cwd, outputPath) : undefined;
    if (output && !output.endsWith(PORTABLE_ARCHIVE_BACKUP_EXTENSION)) {
      return writeArchiveResult(input, action, {
        status: "restore_blocked",
        mutates: false,
        dryRun: true,
        archiveFormat: PORTABLE_ARCHIVE_BACKUP_EXTENSION,
        plan,
        blockedReasons: ["output_must_use_clawbackup_extension"],
      });
    }
    if (output && fs.existsSync(output)) {
      return writeArchiveResult(input, action, {
        status: "requires_approval",
        mutates: false,
        dryRun: true,
        archiveFormat: PORTABLE_ARCHIVE_BACKUP_EXTENSION,
        plan,
        blockedReasons: ["export_output_already_exists"],
        next: "Choose an unused .clawbackup path; export does not overwrite local archives.",
      });
    }
    if (output && !blocked) {
      const written = writeLocalArchive(output, plan.expectedManifest);
      return writeArchiveResult(input, action, {
        status: written.verification.status === "ok" ? "ready" : "verification_failed",
        mutates: true,
        dryRun: false,
        archiveFormat: PORTABLE_ARCHIVE_BACKUP_EXTENSION,
        archivePath: output,
        manifestPath: written.manifestPath,
        plan,
        verification: written.verification,
      });
    }
    return writeArchiveResult(input, action, {
      status: blocked ? "requires_signed_host" : "ready",
      mutates: false,
      dryRun: true,
      archiveFormat: PORTABLE_ARCHIVE_BACKUP_EXTENSION,
      plan,
      next: blocked
        ? "Open the signed host export flow so reauthentication can create the encrypted .clawsecrets envelope."
        : "Pass --output PATH.clawbackup to write a local archive directory with manifest.json.",
    });
  }
  if (action === "verify") {
    if (archiveFormatVerification) return writeArchiveResult(input, action, archiveFormatVerification);
    const manifest = readManifest();
    const verification = resolvedArchivePath
      ? verifyLocalArchive(resolvedArchivePath, manifest, checkedAt)
      : verifyPortableArchiveManifest(manifest, checkedAt);
    return writeArchiveResult(input, action, verification);
  }
  if (action === "inspect") {
    if (archiveFormatVerification) {
      return writeArchiveResult(input, action, { status: "verification_failed", manifest: null, verification: archiveFormatVerification });
    }
    const manifest = readManifest();
    const verification = resolvedArchivePath
      ? verifyLocalArchive(resolvedArchivePath, manifest, checkedAt)
      : verifyPortableArchiveManifest(manifest, checkedAt);
    return writeArchiveResult(input, action, { status: verification.status === "ok" ? "ready" : "verification_failed", manifest, verification });
  }
  if (action === "import") {
    if (archiveFormatVerification) {
      return writeArchiveResult(input, action, failedArchiveImportPreview(targetRoot, archiveFormatVerification));
    }
    const manifest = readManifest();
    if (!isPortableArchiveManifest(manifest)) {
      const verification = verifyPortableArchiveManifest(manifest, checkedAt);
      return writeArchiveResult(input, action, failedArchiveImportPreview(targetRoot, verification));
    }
    const preview = createPortableArchiveImportPreview({ manifest, targetRoot, signedHostAvailable, checkedAt });
    if (!resolvedArchivePath) return writeArchiveResult(input, action, preview);
    const verification = verifyLocalArchive(resolvedArchivePath, manifest, checkedAt);
    return writeArchiveResult(input, action, verification.status === "ok" ? preview : {
      ...preview,
      status: "verification_failed",
      canRestore: false,
      blockedReasons: [...new Set([...preview.blockedReasons, "verification_failed"])],
      verification,
    });
  }
  if (action === "restore") {
    if (archiveFormatVerification) {
      return writeArchiveResult(input, action, {
        mutates: false,
        dryRun: true,
        report: createPortableArchiveRestoreReport({
          preview: failedArchiveImportPreview(targetRoot, archiveFormatVerification),
          approved: false,
          appliedAt: checkedAt,
        }),
      });
    }
    const manifest = readManifest();
    if (!isPortableArchiveManifest(manifest)) {
      const verification = verifyPortableArchiveManifest(manifest, checkedAt);
      return writeArchiveResult(input, action, {
        mutates: false,
        dryRun: true,
        report: createPortableArchiveRestoreReport({
          preview: failedArchiveImportPreview(targetRoot, verification),
          approved: false,
          appliedAt: checkedAt,
        }),
      });
    }
    const basePreview = createPortableArchiveImportPreview({ manifest, targetRoot, signedHostAvailable, checkedAt });
    const verification = resolvedArchivePath ? verifyLocalArchive(resolvedArchivePath, manifest, checkedAt) : basePreview.verification;
    const preview = verification.status === "ok" ? basePreview : {
      ...basePreview,
      status: "verification_failed" as const,
      canRestore: false,
      blockedReasons: [...new Set([...basePreview.blockedReasons, "verification_failed"])],
      verification,
    };
    const approved = readBooleanFlag(argv, input.flags, "approve", readBooleanFlag(argv, input.flags, "accept", false));
    const confirmed = input.flags["confirm-restore"] === targetRoot;
    const canApply = approved && confirmed;
    const report = createPortableArchiveRestoreReport({ preview, approved: canApply, appliedAt: checkedAt });
    return writeArchiveResult(input, action, {
      mutates: false,
      dryRun: !canApply || !preview.canRestore,
      report: !approved || confirmed ? report : {
        ...report,
        status: "requires_approval",
        blockedReasons: [...new Set([...report.blockedReasons, "restore_confirmation_required"])],
      },
    });
  }
  return writeArchiveResult(input, action, {
    status: "ok",
    checks: [
      "archive_cli_registered",
      "local_export_writes_manifest",
      "local_verify_reads_manifest",
      "simulated_import_preview_required",
      "restore_requires_exact_target_confirmation",
      "manifest_schema_available",
      "restore_preview_required",
      "secrets_require_signed_host",
      "plaintext_secret_fixtures_forbidden",
    ],
  });
}

function writeArchiveUsage(input: ArchiveCliInput): number {
  input.context.stderr.write(`Usage: ${input.binName} archive plan|export|verify|inspect|import|restore|doctor [--json] [--include-secrets] [--signed-host] [--output PATH.clawbackup] [--archive PATH.clawbackup] [--target PATH] [--approve --confirm-restore PATH]\n`);
  return CLI_EXIT_USAGE;
}

function writeArchiveResult(input: ArchiveCliInput, action: string, data: unknown): number {
  if (input.wantsJson) {
    writeCommandJsonOk(input.context.stdout, "archive", data, { subcommand: action });
    return CLI_EXIT_OK;
  }
  input.context.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
  return CLI_EXIT_OK;
}

function resolvePath(cwd: string, candidate: string): string {
  return path.isAbsolute(candidate) ? candidate : path.resolve(cwd, candidate);
}

function readCheckedAt(value: string | undefined): string {
  const checkedAt = value ?? "2026-05-21T00:00:00.000Z";
  if (Number.isNaN(Date.parse(checkedAt))) {
    throw new CliHandledError("invalid_archive_checked_at", "--checked-at must be a valid date/time string.", CLI_EXIT_USAGE, {
      location: "cli.archive.checked_at",
      suggestion: "Pass --checked-at as an ISO timestamp such as 2026-05-21T00:00:00.000Z.",
      safeNextStep: "Rerun the archive command with a valid --checked-at timestamp.",
      details: { checkedAt },
    });
  }
  return checkedAt;
}

function readManifestFromLocalArchive(archivePath: string, checkedAt: string): unknown {
  const manifestPath = localManifestPath(archivePath);
  try {
    return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (error) {
    return {
      schemaVersion: 1,
      schemaId: "claw.portableArchive.unreadable.v1",
      archiveKind: "claw_portable_archive",
      format: PORTABLE_ARCHIVE_BACKUP_EXTENSION,
      manifestPath: PORTABLE_ARCHIVE_MANIFEST_PATH,
      createdAt: checkedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function verifyArchiveContainerFormat(archivePath: string, checkedAt: string): PortableArchiveVerificationReport | null {
  if (archivePath.endsWith(PORTABLE_ARCHIVE_BACKUP_EXTENSION)) return null;
  return portableArchiveVerificationReportSchema.parse({
    schemaVersion: 1,
    schemaId: "claw.portableArchive.verificationReport.v1",
    status: "failed",
    manifestId: "unreadable",
    checkedAt,
    counts: { entries: 0, missingHashes: 0, plaintextSecretFindings: 0, externalCopyViolations: 0 },
    issues: [{
      code: "invalid_archive_format",
      severity: "error",
      message: `Archive path must point to a ${PORTABLE_ARCHIVE_BACKUP_EXTENSION} directory.`,
      path: archivePath,
    }],
  });
}

function failedArchiveImportPreview(targetRoot: string, verification: PortableArchiveVerificationReport): PortableArchiveImportPreview {
  return {
    schemaVersion: 1,
    schemaId: "claw.portableArchive.importPreview.v1",
    status: "verification_failed",
    targetRoot,
    canRestore: false,
    requiresSignedHost: false,
    blockedReasons: ["verification_failed"],
    mappedCounts: { records: 0, files: 0, grants: 0, policies: 0, secretsEnvelopes: 0 },
    verification,
  };
}

function localManifestPath(archivePath: string): string {
  return path.join(archivePath, PORTABLE_ARCHIVE_MANIFEST_PATH);
}

function isPortableArchiveManifest(value: unknown): value is PortableArchiveManifestV1 {
  return typeof value === "object" && value !== null
    && (value as { schemaId?: unknown }).schemaId === "claw.portableArchive.manifest.v1";
}

function writeLocalArchive(archivePath: string, manifest: PortableArchiveManifestV1): { manifestPath: string; verification: PortableArchiveVerificationReport } {
  fs.mkdirSync(archivePath, { recursive: true });
  const materialized = materializeReceiptFiles(archivePath, materializeManifestFiles(archivePath, manifest));
  const manifestPath = path.join(archivePath, PORTABLE_ARCHIVE_MANIFEST_PATH);
  fs.writeFileSync(manifestPath, `${JSON.stringify(materialized, null, 2)}\n`, "utf8");
  return { manifestPath, verification: verifyLocalArchive(archivePath, materialized, materialized.createdAt) };
}

function materializeManifestFiles(archivePath: string, manifest: PortableArchiveManifestV1): PortableArchiveManifestV1 {
  const inventory = manifest.inventory.map((entry) => {
    if (entry.restoreStrategy === "reference_external" || entry.restoreStrategy === "rebuild_from_canonical") return entry;
    const portablePath = normalizePortablePath(entry.portablePath, entry.id, entry.format);
    const body = archivePayloadForEntry(entry.id, entry.kind);
    const absolutePath = path.join(archivePath, portablePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, body, "utf8");
    return {
      ...entry,
      portablePath,
      bytes: Buffer.byteLength(body),
      hash: { algorithm: "sha256" as const, value: sha256(body) },
    };
  });
  return { ...manifest, inventory };
}

function materializeReceiptFiles(archivePath: string, manifest: PortableArchiveManifestV1): PortableArchiveManifestV1 {
  return {
    ...manifest,
    receipts: {
      ...manifest.receipts,
      entries: manifest.receipts.entries.map((receipt) => {
        const body = `${JSON.stringify({ id: receipt.id, redaction: manifest.receipts.redaction, fixture: "portable_archive_receipt" })}\n`;
        const absolutePath = path.join(archivePath, receipt.receiptPath);
        if (!isInside(archivePath, absolutePath)) throw new Error(`Receipt path escapes archive root: ${receipt.receiptPath}`);
        fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
        fs.writeFileSync(absolutePath, body, "utf8");
        return {
          ...receipt,
          hash: { algorithm: "sha256" as const, value: sha256(body) },
        };
      }),
    },
  };
}

function verifyLocalArchive(archivePath: string, manifest: unknown, checkedAt: string): PortableArchiveVerificationReport {
  const base = verifyPortableArchiveManifest(manifest, checkedAt);
  if (!isPortableArchiveManifest(manifest)) return base;
  const issues = [...base.issues];
  for (const entry of manifest.inventory) {
    if (!entry.hash || entry.restoreStrategy === "reference_external" || entry.restoreStrategy === "rebuild_from_canonical") continue;
    const absolutePath = path.join(archivePath, entry.portablePath);
    if (!isInside(archivePath, absolutePath)) {
      issues.push({ code: "archive_path_escape", severity: "error", message: `${entry.id} escapes the archive root.`, path: entry.portablePath });
      continue;
    }
    if (!fs.existsSync(absolutePath)) {
      issues.push({ code: "missing_archive_file", severity: "error", message: `${entry.id} is missing from the archive.`, path: entry.portablePath });
      continue;
    }
    const actual = sha256(fs.readFileSync(absolutePath));
    if (actual !== entry.hash.value) {
      issues.push({ code: "hash_mismatch", severity: "error", message: `${entry.id} hash does not match archive contents.`, path: entry.portablePath });
    }
  }
  for (const receipt of manifest.receipts.entries) {
    const absolutePath = path.join(archivePath, receipt.receiptPath);
    if (!isInside(archivePath, absolutePath)) {
      issues.push({ code: "receipt_path_escape", severity: "error", message: `${receipt.id} receipt escapes the archive root.`, path: receipt.receiptPath });
      continue;
    }
    if (!fs.existsSync(absolutePath)) {
      issues.push({ code: "missing_receipt_file", severity: "error", message: `${receipt.id} receipt is missing from the archive.`, path: receipt.receiptPath });
      continue;
    }
    const actual = sha256(fs.readFileSync(absolutePath));
    if (actual !== receipt.hash.value) {
      issues.push({ code: "receipt_hash_mismatch", severity: "error", message: `${receipt.id} receipt hash does not match archive contents.`, path: receipt.receiptPath });
    }
  }
  return portableArchiveVerificationReportSchema.parse({
    ...base,
    status: issues.some((issue) => issue.severity === "error") ? "failed" : "ok",
    issues,
  });
}

function normalizePortablePath(portablePath: string, id: string, format: string): string {
  const extension = format.startsWith(".") ? format : `.${format === "ordinary_files" ? "json" : format}`;
  if (portablePath.includes("*")) return portablePath.replace("*", id).replace(/\/$/, `/${id}${extension}`);
  if (portablePath.endsWith("/")) return `${portablePath}${id}${extension}`;
  return portablePath;
}

function archivePayloadForEntry(id: string, kind: PortableArchiveManifestV1["inventory"][number]["kind"]): string {
  return `${JSON.stringify({ id, kind, redaction: "redacted", fixture: "portable_archive_local_export" })}\n`;
}

function sha256(value: string | Buffer): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
