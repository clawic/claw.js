import { CLAW_DEBT_CONTROL_RELEASE_EFFECTS, CLAW_DEBT_CONTROL_SEVERITIES, CLAW_DEBT_LEDGER_CLASSIFICATIONS, CLAW_DEBT_LEDGER_SOURCE_TYPES, CLAW_DEBT_LEDGER_STATUSES, buildClawDebtLedger, type ClawDebtControlReleaseEffect, type ClawDebtControlSeverity, type ClawDebtLedger, type ClawDebtLedgerClassification, type ClawDebtLedgerEntry, type ClawDebtLedgerSourceType, type ClawDebtLedgerStatus } from "@clawjs/core/catalogs";

import { CliHandledError, CLI_EXIT_FAILURE, CLI_EXIT_OK, CLI_EXIT_USAGE } from "./cli-errors.ts";
import { formatCliTable, readBooleanFlag } from "./cli-flag-parsers.ts";
import { writeCommandJsonError, writeCommandJsonOk } from "./cli-json.ts";

interface DebtCliInput {
  argv?: string[];
  positionals: string[];
  flags: Record<string, string>;
  context: {
    stdout: NodeJS.WritableStream;
    stderr: NodeJS.WritableStream;
    cwd: string;
  };
  wantsJson: boolean;
  binName: string;
}

const DEBT_SUBCOMMANDS = ["list", "show", "audit", "sources"] as const;

export async function runDebtCli(input: DebtCliInput): Promise<number> {
  const action = input.positionals[1] || "list";
  const ledger = buildClawDebtLedger({ rootDir: input.flags.root || input.context.cwd, generatedAt: input.flags.now });

  if (action === "list") {
    const entries = filterDebtEntries(ledger.entries, input.flags, input.argv ?? []);
    return writeDebtResult(input, action, { ...summaryPayload(ledger), entries });
  }

  if (action === "show") {
    const id = input.positionals[2] || input.flags.id;
    if (!id) throw new CliHandledError("missing_debt_id", `Usage: ${input.binName} debt show <id> --json`, CLI_EXIT_USAGE);
    const entry = ledger.entries.find((candidate) => candidate.id === id || candidate.fingerprint === id);
    if (!entry) throw new CliHandledError("debt_not_found", `No debt ledger entry found for ${id}.`, CLI_EXIT_USAGE);
    return writeDebtResult(input, action, { entry });
  }

  if (action === "audit") {
    const strict = strictFlag(input.flags, input.argv ?? []);
    const payload = { ...summaryPayload(ledger), strict, audit: ledger.audit };
    const result = writeDebtResult(input, action, payload);
    if (strict && ledger.audit.strictFailures.length > 0) return CLI_EXIT_FAILURE;
    return result;
  }

  if (action === "sources") {
    return writeDebtResult(input, action, { sources: ledger.sources });
  }

  return writeDebtUsage(input);
}

function writeDebtUsage(input: DebtCliInput): number {
  if (input.wantsJson) {
    const received = input.positionals[1] ?? null;
    writeCommandJsonError(input.context.stdout, "debt", new CliHandledError(
      "unknown_debt_subcommand",
      received ? `Unknown debt subcommand: ${received}.` : "Missing debt subcommand.",
      CLI_EXIT_USAGE,
      {
        location: "cli.debt.subcommand",
        suggestion: "Use one of the registered debt subcommands.",
        safeNextStep: `Run ${input.binName} debt list --json to inspect the debt ledger, or ${input.binName} help debt --json for the debt command surface.`,
        details: {
          received,
          validSubcommands: [...DEBT_SUBCOMMANDS],
        },
      },
    ), {
      subcommand: received,
    });
    return CLI_EXIT_USAGE;
  }

  input.context.stderr.write([
    `Usage: ${input.binName} debt list|show|audit|sources [options]`,
    "",
    "Options:",
    "  --repo clawjs|clawix",
    "  --classification external_pending|lateral_debt|...",
    "  --status open|blocked|external_pending|...",
    "  --source-type code_hygiene|source_size|...",
    "  --severity P0|P1|P2|P3",
    "  --release-effect blocks_release|blocks_growth|report_only",
    "  --needs-action",
    "  --strict (audit only)",
    "  --json",
  ].join("\n") + "\n");
  return CLI_EXIT_USAGE;
}

function writeDebtResult(input: DebtCliInput, action: string, data: unknown): number {
  if (input.wantsJson) {
    writeCommandJsonOk(input.context.stdout, "debt", data, {
      subcommand: action,
      jsonSchemaId: "claw.cli.debt.v1",
    });
    return CLI_EXIT_OK;
  }
  if (isEntryListPayload(data)) {
    input.context.stdout.write(`${formatCliTable(data.entries.map((entry) => ({
      id: entry.id,
      repo: entry.repo,
      classification: entry.classification,
      status: entry.status,
      source: entry.canonicalSource,
      summary: entry.summary,
    })))}\n`);
    return CLI_EXIT_OK;
  }
  if (isAuditPayload(data)) {
    input.context.stdout.write([
      `entries\t${data.summary.entries}`,
      `warnings\t${data.audit.warnings.length}`,
      `missingActionability\t${data.audit.missingActionability?.length ?? 0}`,
      `aliasHits\t${data.audit.aliasHits?.length ?? 0}`,
      `unindexedCandidates\t${data.audit.unindexedCandidates.length}`,
      `expiredEntries\t${data.audit.expiredEntries.length}`,
      `duplicateFingerprints\t${data.audit.duplicateFingerprints.length}`,
      `strictFailures\t${data.audit.strictFailures.length}`,
      `privateSummary\t${data.audit.privateSummary.included ? "included" : "excluded"}`,
    ].join("\n") + "\n");
    return CLI_EXIT_OK;
  }
  if (isSourcesPayload(data)) {
    input.context.stdout.write(`${formatCliTable(data.sources.map((source) => ({
      repo: source.repo,
      type: source.sourceType,
      status: source.status,
      entries: String(source.entries),
      path: source.path,
    })))}\n`);
    return CLI_EXIT_OK;
  }
  input.context.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
  return CLI_EXIT_OK;
}

function summaryPayload(ledger: ClawDebtLedger): {
  schemaVersion: 1;
  generatedAt: string;
  mode: "report_only";
  summary: Record<string, number>;
  classifications: readonly string[];
  statuses: readonly string[];
} {
  return {
    schemaVersion: 1,
    generatedAt: ledger.generatedAt,
    mode: ledger.mode,
    summary: {
      entries: ledger.entries.length,
      sources: ledger.sources.length,
      warnings: ledger.audit.warnings.length,
      missingActionability: ledger.audit.missingActionability?.length ?? 0,
      aliasHits: ledger.audit.aliasHits?.length ?? 0,
      unindexedCandidates: ledger.audit.unindexedCandidates.length,
      expiredEntries: ledger.audit.expiredEntries.length,
      duplicateFingerprints: ledger.audit.duplicateFingerprints.length,
      strictFailures: ledger.audit.strictFailures.length,
    },
    classifications: ledger.classifications,
    statuses: ledger.statuses,
  };
}

function filterDebtEntries(entries: ClawDebtLedgerEntry[], flags: Record<string, string>, argv: string[]): ClawDebtLedgerEntry[] {
  const repo = flags.repo;
  const classification = parseClassification(flags.classification);
  const status = parseStatus(flags.status);
  const sourceType = parseSourceType(flags["source-type"] || flags.source);
  const severity = parseSeverity(flags.severity);
  const releaseEffect = parseReleaseEffect(flags["release-effect"] || flags.releaseEffect);
  const needsAction = readBooleanFlag(argv, flags, "needs-action", false);
  return entries.filter((entry) =>
    (!repo || entry.repo === repo)
    && (!classification || entry.classification === classification)
    && (!status || entry.status === status)
    && (!sourceType || entry.sourceType === sourceType)
    && (!severity || entry.debtControl.severity === severity)
    && (!releaseEffect || entry.debtControl.releaseEffect.mode === releaseEffect)
    && (!needsAction || entryNeedsAction(entry))
  );
}

function entryNeedsAction(entry: ClawDebtLedgerEntry): boolean {
  const reviewDate = entry.reviewBy ?? entry.expires;
  return !reviewDate || !entry.reentryCommand || reviewDate < new Date().toISOString().slice(0, 10);
}

function parseClassification(value: string | undefined): ClawDebtLedgerClassification | undefined {
  if (!value) return undefined;
  if ((CLAW_DEBT_LEDGER_CLASSIFICATIONS as readonly string[]).includes(value)) return value as ClawDebtLedgerClassification;
  throw new CliHandledError("invalid_debt_classification", `Use one of: ${CLAW_DEBT_LEDGER_CLASSIFICATIONS.join(", ")}.`, CLI_EXIT_USAGE);
}

function parseStatus(value: string | undefined): ClawDebtLedgerStatus | undefined {
  if (!value) return undefined;
  if ((CLAW_DEBT_LEDGER_STATUSES as readonly string[]).includes(value)) return value as ClawDebtLedgerStatus;
  throw new CliHandledError("invalid_debt_status", `Use one of: ${CLAW_DEBT_LEDGER_STATUSES.join(", ")}.`, CLI_EXIT_USAGE);
}

function parseSourceType(value: string | undefined): ClawDebtLedgerSourceType | undefined {
  if (!value) return undefined;
  if ((CLAW_DEBT_LEDGER_SOURCE_TYPES as readonly string[]).includes(value)) return value as ClawDebtLedgerSourceType;
  throw new CliHandledError("invalid_debt_source_type", `Use one of: ${CLAW_DEBT_LEDGER_SOURCE_TYPES.join(", ")}.`, CLI_EXIT_USAGE);
}

function parseSeverity(value: string | undefined): ClawDebtControlSeverity | undefined {
  if (!value) return undefined;
  if ((CLAW_DEBT_CONTROL_SEVERITIES as readonly string[]).includes(value)) return value as ClawDebtControlSeverity;
  throw new CliHandledError("invalid_debt_severity", `Use one of: ${CLAW_DEBT_CONTROL_SEVERITIES.join(", ")}.`, CLI_EXIT_USAGE);
}

function parseReleaseEffect(value: string | undefined): ClawDebtControlReleaseEffect | undefined {
  if (!value) return undefined;
  if ((CLAW_DEBT_CONTROL_RELEASE_EFFECTS as readonly string[]).includes(value)) return value as ClawDebtControlReleaseEffect;
  throw new CliHandledError("invalid_debt_release_effect", `Use one of: ${CLAW_DEBT_CONTROL_RELEASE_EFFECTS.join(", ")}.`, CLI_EXIT_USAGE);
}

function strictFlag(flags: Record<string, string>, argv: string[]): boolean {
  const value = flags.strict;
  if (value === undefined) return argv.includes("--strict");
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes"].includes(normalized)) return true;
  if (["false", "0", "no"].includes(normalized)) return false;
  throw new CliHandledError("invalid_debt_strict", "Use --strict as a bare flag or with true|false, 1|0, yes|no.", CLI_EXIT_USAGE);
}

function isEntryListPayload(value: unknown): value is { entries: ClawDebtLedgerEntry[] } {
  return !!value && typeof value === "object" && Array.isArray((value as { entries?: unknown }).entries);
}

function isAuditPayload(value: unknown): value is { summary: Record<string, number>; audit: ClawDebtLedger["audit"] } {
  return !!value && typeof value === "object" && !!(value as { audit?: unknown }).audit && !!(value as { summary?: unknown }).summary;
}

function isSourcesPayload(value: unknown): value is { sources: ClawDebtLedger["sources"] } {
  return !!value && typeof value === "object" && Array.isArray((value as { sources?: unknown }).sources);
}
