import {
  CLAW_DEBT_LEDGER_CLASSIFICATIONS,
  CLAW_DEBT_LEDGER_SOURCE_TYPES,
  CLAW_DEBT_LEDGER_STATUSES,
  buildClawDebtLedger,
  type ClawDebtLedger,
  type ClawDebtLedgerClassification,
  type ClawDebtLedgerEntry,
  type ClawDebtLedgerSourceType,
  type ClawDebtLedgerStatus,
} from "@clawjs/core";

import { CliHandledError, CLI_EXIT_OK, CLI_EXIT_USAGE } from "./cli-errors.ts";
import { formatCliTable } from "./cli-flag-parsers.ts";
import { writeCommandJsonOk } from "./cli-json.ts";

interface DebtCliInput {
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

export async function runDebtCli(input: DebtCliInput): Promise<number> {
  const action = input.positionals[1] || "list";
  const ledger = buildClawDebtLedger({ rootDir: input.flags.root || input.context.cwd, generatedAt: input.flags.now });

  if (action === "list") {
    const entries = filterDebtEntries(ledger.entries, input.flags);
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
    return writeDebtResult(input, action, { ...summaryPayload(ledger), audit: ledger.audit });
  }

  if (action === "sources") {
    return writeDebtResult(input, action, { sources: ledger.sources });
  }

  return writeDebtUsage(input);
}

function writeDebtUsage(input: DebtCliInput): number {
  input.context.stderr.write([
    `Usage: ${input.binName} debt list|show|audit|sources [options]`,
    "",
    "Options:",
    "  --repo clawjs|clawix",
    "  --classification external_pending|lateral_debt|...",
    "  --status open|blocked|external_pending|...",
    "  --source-type code_hygiene|source_size|...",
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
      `unindexedCandidates\t${data.audit.unindexedCandidates.length}`,
      `expiredEntries\t${data.audit.expiredEntries.length}`,
      `duplicateFingerprints\t${data.audit.duplicateFingerprints.length}`,
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
      unindexedCandidates: ledger.audit.unindexedCandidates.length,
      expiredEntries: ledger.audit.expiredEntries.length,
      duplicateFingerprints: ledger.audit.duplicateFingerprints.length,
    },
    classifications: ledger.classifications,
    statuses: ledger.statuses,
  };
}

function filterDebtEntries(entries: ClawDebtLedgerEntry[], flags: Record<string, string>): ClawDebtLedgerEntry[] {
  const repo = flags.repo;
  const classification = parseClassification(flags.classification);
  const status = parseStatus(flags.status);
  const sourceType = parseSourceType(flags["source-type"] || flags.source);
  return entries.filter((entry) =>
    (!repo || entry.repo === repo)
    && (!classification || entry.classification === classification)
    && (!status || entry.status === status)
    && (!sourceType || entry.sourceType === sourceType)
  );
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

function isEntryListPayload(value: unknown): value is { entries: ClawDebtLedgerEntry[] } {
  return !!value && typeof value === "object" && Array.isArray((value as { entries?: unknown }).entries);
}

function isAuditPayload(value: unknown): value is { summary: Record<string, number>; audit: ClawDebtLedger["audit"] } {
  return !!value && typeof value === "object" && !!(value as { audit?: unknown }).audit && !!(value as { summary?: unknown }).summary;
}

function isSourcesPayload(value: unknown): value is { sources: ClawDebtLedger["sources"] } {
  return !!value && typeof value === "object" && Array.isArray((value as { sources?: unknown }).sources);
}
