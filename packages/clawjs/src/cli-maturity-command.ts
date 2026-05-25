import { auditClawCapabilityMaturityRegistry, listClawCapabilityMaturityEntries } from "@clawjs/core/catalogs";

import { CLI_EXIT_OK, CLI_EXIT_USAGE, CliHandledError } from "./cli-errors.ts";
import { formatCliTable } from "./cli-flag-parsers.ts";
import { writeCommandJsonError, writeCommandJsonOk } from "./cli-json.ts";

interface MaturityCliInput {
  positionals: string[];
  flags: Record<string, string>;
  context: {
    stdout: NodeJS.WritableStream;
    stderr: NodeJS.WritableStream;
  };
  wantsJson: boolean;
  binName: string;
}

const activationTierOrder = ["stable", "beta", "experimental", "dev"] as const;
const maturityOrder = ["incomplete", "experimental", "beta", "stable", "retired"] as const;

export async function runMaturityCli(input: MaturityCliInput): Promise<number> {
  const action = input.positionals[1] || "list";
  const target = input.positionals[2] || input.flags.id;
  const entries = listClawCapabilityMaturityEntries();
  const audit = auditClawCapabilityMaturityRegistry();

  if (action === "list") {
    return writeMaturityResult(input, action, {
      version: 1,
      activationTierOrder,
      maturityOrder,
      defaultMaturity: "incomplete",
      blockedCode: "maturity_blocked",
      audit,
      entries,
    });
  }

  if (action === "show") {
    if (!target) throw new CliHandledError("missing_maturity_target", `Usage: ${input.binName} maturity show <id|parent|maturity> --json`, CLI_EXIT_USAGE);
    const selected = entries.filter((entry) => entry.id === target || entry.parentId === target || entry.maturity === target);
    if (!selected.length) throw new CliHandledError("maturity_entry_not_found", `No maturity entry found for ${target}.`, CLI_EXIT_USAGE);
    return writeMaturityResult(input, action, {
      version: 1,
      target,
      audit,
      entries: selected,
    });
  }

  if (action === "audit") {
    return writeMaturityResult(input, action, {
      ok: audit.ok,
      failures: audit.failures,
      checkedEntries: entries.length,
    });
  }

  if (action === "tier") {
    return writeMaturityResult(input, action, {
      activationTierOrder,
      maturityOrder,
      defaultMaturity: "incomplete",
      blockedCode: "maturity_blocked",
    });
  }

  return writeMaturityUsage(input);
}

function writeMaturityUsage(input: MaturityCliInput): number {
  if (input.wantsJson) {
    writeCommandJsonError(
      input.context.stdout,
      "maturity",
      new CliHandledError("invalid_maturity_action", "Use maturity list, show, audit, or tier.", CLI_EXIT_USAGE),
      { jsonSchemaId: "claw.cli.maturity.v1" },
    );
    return CLI_EXIT_USAGE;
  }
  input.context.stderr.write(`Usage: ${input.binName} maturity list|show|audit|tier [--json]\n`);
  return CLI_EXIT_USAGE;
}

function writeMaturityResult(input: MaturityCliInput, subcommand: string, data: unknown): number {
  if (input.wantsJson) {
    writeCommandJsonOk(input.context.stdout, "maturity", data, {
      jsonSchemaId: "claw.cli.maturity.v1",
      subcommand,
    });
    return CLI_EXIT_OK;
  }
  if (isEntryList(data)) {
    input.context.stdout.write(`${formatCliTable(data.entries.map((entry) => ({
      id: entry.id,
      maturity: entry.maturity,
      activation: entry.activationPolicy,
      steward: entry.steward,
    })))}\n`);
    return CLI_EXIT_OK;
  }
  if (isAuditPayload(data)) {
    input.context.stdout.write(`${data.ok ? "ok" : "failed"}\t${data.failures.length} failures\t${data.checkedEntries} entries\n`);
    return CLI_EXIT_OK;
  }
  input.context.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
  return CLI_EXIT_OK;
}

function isEntryList(value: unknown): value is { entries: Array<{ id: string; maturity: string; activationPolicy: string; steward: string }> } {
  return !!value && typeof value === "object" && Array.isArray((value as { entries?: unknown }).entries);
}

function isAuditPayload(value: unknown): value is { ok: boolean; failures: string[]; checkedEntries: number } {
  return !!value && typeof value === "object" && typeof (value as { ok?: unknown }).ok === "boolean" && Array.isArray((value as { failures?: unknown }).failures);
}
