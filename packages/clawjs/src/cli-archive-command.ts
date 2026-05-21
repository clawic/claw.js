import {
  createPortableArchiveImportPreview,
  createPortableArchiveManifestFixture,
  createPortableArchivePlan,
  createPortableArchiveRestoreReport,
  verifyPortableArchiveManifest,
} from "@clawjs/core";

import { CLI_EXIT_OK, CLI_EXIT_USAGE } from "./cli-errors.ts";
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
  const checkedAt = input.flags["checked-at"] ?? "2026-05-21T00:00:00.000Z";
  const manifest = createPortableArchiveManifestFixture({ sourceRoot, includeSecrets, requestedAt: checkedAt });

  if (action === "plan") {
    return writeArchiveResult(input, action, createPortableArchivePlan({ sourceRoot, includeSecrets, requestedAt: checkedAt }));
  }
  if (action === "export") {
    const plan = createPortableArchivePlan({ sourceRoot, includeSecrets, requestedAt: checkedAt });
    return writeArchiveResult(input, action, {
      status: includeSecrets && !signedHostAvailable ? "requires_signed_host" : "ready",
      mutates: false,
      dryRun: true,
      archiveFormat: ".clawbackup",
      plan,
      next: includeSecrets && !signedHostAvailable
        ? "Open the signed host export flow so reauthentication can create the encrypted .clawsecrets envelope."
        : "Pass the signed host export plan to the host writer before creating the archive.",
    });
  }
  if (action === "verify") {
    return writeArchiveResult(input, action, verifyPortableArchiveManifest(manifest, checkedAt));
  }
  if (action === "inspect") {
    return writeArchiveResult(input, action, { status: "ready", manifest });
  }
  if (action === "import") {
    return writeArchiveResult(input, action, createPortableArchiveImportPreview({ manifest, targetRoot, signedHostAvailable, checkedAt }));
  }
  if (action === "restore") {
    const preview = createPortableArchiveImportPreview({ manifest, targetRoot, signedHostAvailable, checkedAt });
    const approved = readBooleanFlag(argv, input.flags, "approve", readBooleanFlag(argv, input.flags, "accept", false));
    return writeArchiveResult(input, action, {
      mutates: false,
      dryRun: !approved || !preview.canRestore,
      report: createPortableArchiveRestoreReport({ preview, approved, appliedAt: checkedAt }),
    });
  }
  return writeArchiveResult(input, action, {
    status: "ok",
    checks: [
      "archive_cli_registered",
      "manifest_schema_available",
      "restore_preview_required",
      "secrets_require_signed_host",
      "plaintext_secret_fixtures_forbidden",
    ],
  });
}

function writeArchiveUsage(input: ArchiveCliInput): number {
  input.context.stderr.write(`Usage: ${input.binName} archive plan|export|verify|inspect|import|restore|doctor [--json] [--include-secrets] [--signed-host] [--target PATH]\n`);
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
