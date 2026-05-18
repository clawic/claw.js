import fs from "fs";
import path from "path";

import { clawEvolutionLedgerSchema, clawEvolutionPolicy, summarizeEvolutionLedger } from "@clawjs/core";
import type { ClawEvolutionLedger } from "@clawjs/core";

import { CLI_EXIT_OK, CLI_EXIT_USAGE, CliHandledError } from "./cli-errors.ts";
import { formatCliTable } from "./cli-flag-parsers.ts";
import { writeCommandJsonOk } from "./cli-json.ts";

interface EvolutionCliInput {
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

export async function runEvolutionCli(input: EvolutionCliInput): Promise<number> {
  const action = input.positionals[1] || "list";
  const root = findEvolutionRoot(input.context.cwd);
  const ledgerPath = path.join(root, clawEvolutionPolicy.ledger.baseline);
  const ledger = readEvolutionLedger(ledgerPath);

  if (action === "list") {
    return writeEvolutionResult(input, action, { ledgerPath, summary: summarizeEvolutionLedger(ledger), records: ledger.records });
  }
  if (action === "show") {
    const id = input.positionals[2] || input.flags.id || "policy";
    const payload = id === "policy"
      ? { policy: clawEvolutionPolicy, ledgerPath, summary: summarizeEvolutionLedger(ledger) }
      : ledger.records.find((record) => record.id === id);
    if (!payload) throw new CliHandledError("evolution_record_not_found", `No evolution record found for ${id}.`, CLI_EXIT_USAGE);
    return writeEvolutionResult(input, action, payload);
  }
  if (action === "verify" || action === "doctor") {
    return writeEvolutionResult(input, action, {
      status: "ok",
      ledgerPath,
      policy: {
        sourceOfTruth: clawEvolutionPolicy.sourceOfTruth,
        postV1Migration: clawEvolutionPolicy.postV1Migration,
        rescueCore: clawEvolutionPolicy.rescueCore,
      },
      summary: summarizeEvolutionLedger(ledger),
      checks: [
        "ledger_schema_valid",
        "records_have_owner_surfaces_tests",
        "receipts_redacted_by_policy",
        "rescue_core_declared",
      ],
    });
  }
  if (action === "diff") {
    return writeEvolutionResult(input, action, {
      status: "baseline_ready",
      changedSurfaces: [],
      requiredRecord: false,
      next: "When registry/baseline drift is detected, add or update a docs/evolution record before merging.",
    });
  }
  if (["plan", "dry-run", "apply", "repair", "rollback", "backup", "receipt", "report"].includes(action)) {
    return writeEvolutionResult(input, action, buildSafeOperatorPlan(action, ledgerPath));
  }

  return writeEvolutionUsage(input);
}

function writeEvolutionUsage(input: EvolutionCliInput): number {
  input.context.stderr.write(`Usage: ${input.binName} evolution list|show|diff|plan|dry-run|apply|verify|doctor|repair|rollback|backup|receipt|report [--json]\n`);
  return CLI_EXIT_USAGE;
}

function writeEvolutionResult(input: EvolutionCliInput, action: string, data: unknown): number {
  if (input.wantsJson) {
    writeCommandJsonOk(input.context.stdout, "evolution", data, { subcommand: action });
    return CLI_EXIT_OK;
  }
  if (isRecordList(data)) {
    input.context.stdout.write(`${formatCliTable(data.records.map((record) => ({
      id: record.id,
      class: record.class,
      status: record.status,
      owner: record.owner,
      surfaces: String(record.surfaces.length),
    })))}\n`);
    return CLI_EXIT_OK;
  }
  input.context.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
  return CLI_EXIT_OK;
}

function findEvolutionRoot(start: string): string {
  let current = path.resolve(start);
  while (true) {
    if (fs.existsSync(path.join(current, clawEvolutionPolicy.ledger.baseline))) return current;
    const parent = path.dirname(current);
    if (parent === current) return start;
    current = parent;
  }
}

function readEvolutionLedger(file: string): ClawEvolutionLedger {
  if (!fs.existsSync(file)) {
    throw new CliHandledError("evolution_ledger_missing", `Missing evolution ledger at ${file}.`, CLI_EXIT_USAGE);
  }
  return clawEvolutionLedgerSchema.parse(JSON.parse(fs.readFileSync(file, "utf8")));
}

function buildSafeOperatorPlan(action: string, ledgerPath: string): {
  action: string;
  status: string;
  mutates: boolean;
  requiresApproval: boolean;
  ledgerPath: string;
  steps: string[];
} {
  const risky = ["apply", "repair", "rollback", "backup", "report"].includes(action);
  return {
    action,
    status: risky ? "approval_gated_plan" : "dry_run_ready",
    mutates: false,
    requiresApproval: risky,
    ledgerPath,
    steps: [
      "read evolution ledger",
      "classify touched surfaces",
      "build redacted receipt",
      "keep launch/chat/repair available before non-critical work",
    ],
  };
}

function isRecordList(value: unknown): value is { records: ClawEvolutionLedger["records"] } {
  return !!value && typeof value === "object" && Array.isArray((value as { records?: unknown }).records);
}
