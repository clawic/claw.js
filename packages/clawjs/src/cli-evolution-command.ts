import fs from "fs";
import path from "path";

import { clawEvolutionLedgerSchema, clawEvolutionPolicy, clawEvolutionPublicSurfaceBaselineSchema, clawEvolutionVersionFixtureSchema, createEvolutionOperatorPlan, createEvolutionPublicSurfaceBaseline, createEvolutionRepairReport, createEvolutionReceipt, createEvolutionRollbackReport, diffEvolutionPublicSurfaceBaseline, runEvolutionMigratorLab, summarizeEvolutionLedger } from "@clawjs/core";
import { clawCliCommandRegistry, clawPersistentSurfaceRegistry } from "@clawjs/core/catalogs";
import type { ClawEvolutionLedger, ClawEvolutionOperatorAction, ClawEvolutionPublicSurfaceBaseline, ClawEvolutionVersionFixture } from "@clawjs/core";

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
  const root = findEvolutionRoot(input.flags.root || input.context.cwd);
  const ledgerPath = path.join(root, clawEvolutionPolicy.ledger.baseline);
  const publicSurfaceBaselinePath = path.join(root, clawEvolutionPolicy.ledger.publicSurfaceBaseline);
  const fixtureDirectory = path.join(root, clawEvolutionPolicy.ledger.directory, "fixtures");
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
    const baseline = readPublicSurfaceBaseline(publicSurfaceBaselinePath);
    const current = createCurrentPublicSurfaceBaseline();
    const diff = baseline ? diffEvolutionPublicSurfaceBaseline({ baseline, current, ledger }) : null;
    const fixtures = readEvolutionFixtures(fixtureDirectory);
    const migrationLab = runEvolutionMigratorLab({
      fixtures,
      ledger,
      stableSurfaces: clawPersistentSurfaceRegistry.nodes,
      fromVersion: input.flags.from,
      toVersion: input.flags.to,
    });
    return writeEvolutionResult(input, action, {
      status: (!diff || diff.uncoveredChanges.length === 0) && migrationLab.status === "pass" ? "ok" : "needs_attention",
      ledgerPath,
      publicSurfaceBaselinePath,
      fixtureDirectory,
      policy: {
        sourceOfTruth: clawEvolutionPolicy.sourceOfTruth,
        postV1Migration: clawEvolutionPolicy.postV1Migration,
        rescueCore: clawEvolutionPolicy.rescueCore,
      },
      summary: summarizeEvolutionLedger(ledger),
      surfaceBaseline: diff
        ? { status: diff.status, changed: diff.summary.changed, uncovered: diff.summary.uncovered }
        : { status: "missing", changed: null, uncovered: null },
      migrationLab,
      checks: [
        "ledger_schema_valid",
        "records_have_steward_surfaces_tests",
        "receipts_redacted_by_policy",
        "rescue_core_declared",
        diff && diff.uncoveredChanges.length === 0 ? "public_surface_baseline_covered" : "public_surface_baseline_needs_attention",
        migrationLab.status === "pass" ? "migration_lab_foundation_fixture_passed" : "migration_lab_needs_attention",
      ],
    });
  }
  if (action === "diff") {
    const baseline = readPublicSurfaceBaseline(publicSurfaceBaselinePath);
    if (!baseline) {
      return writeEvolutionResult(input, action, {
        status: "baseline_missing",
        publicSurfaceBaselinePath,
        requiredRecord: true,
        next: "Create docs/evolution/public-surface-baseline.json from the current registry before relying on evolution diff gates.",
      });
    }
    const current = createCurrentPublicSurfaceBaseline();
    const diff = diffEvolutionPublicSurfaceBaseline({ baseline, current, ledger });
    return writeEvolutionResult(input, action, {
      status: diff.status,
      publicSurfaceBaselinePath,
      changedSurfaces: diff.changes.map((change) => change.id),
      uncoveredChanges: diff.uncoveredChanges,
      requiredRecord: diff.uncoveredChanges.length > 0,
      summary: diff.summary,
      next: diff.uncoveredChanges.length > 0
        ? "Add or update a docs/evolution record covering every changed surface before merging."
        : "No uncovered public surface drift detected.",
    });
  }
  if (["plan", "dry-run", "apply", "repair", "rollback", "backup", "receipt", "report"].includes(action)) {
    const baseline = readPublicSurfaceBaseline(publicSurfaceBaselinePath);
    const current = createCurrentPublicSurfaceBaseline();
    const diff = baseline ? diffEvolutionPublicSurfaceBaseline({ baseline, current, ledger }) : null;
    const fixtures = readEvolutionFixtures(fixtureDirectory);
    const migrationLab = runEvolutionMigratorLab({
      fixtures,
      ledger,
      stableSurfaces: clawPersistentSurfaceRegistry.nodes,
      fromVersion: input.flags.from,
      toVersion: input.flags.to,
    });
    const plan = createEvolutionOperatorPlan({
      action: action as ClawEvolutionOperatorAction,
      ledger,
      ledgerPath,
      changes: diff?.changes,
      fromVersion: input.flags.from,
      toVersion: input.flags.to,
    });
    const surfaceBaseline = diff
      ? { status: diff.status, changed: diff.summary.changed, uncovered: diff.summary.uncovered }
      : { status: "missing" as const, changed: null, uncovered: null };
    if (action === "receipt") {
      return writeEvolutionResult(input, action, {
        plan,
        migrationLab,
        receipt: createEvolutionReceipt({
          action: "receipt",
          plan,
          notes: ["receipt created without prompts, secrets, or full local paths"],
        }),
      });
    }
    if (action === "repair" || action === "report") {
      return writeEvolutionResult(input, action, {
        ...plan,
        surfaceBaseline,
        migrationLab,
        repairReport: createEvolutionRepairReport({
          action: action as ClawEvolutionOperatorAction,
          plan,
          migrationLab,
          surfaceBaseline,
        }),
      });
    }
    if (action === "backup" || action === "rollback") {
      return writeEvolutionResult(input, action, {
        ...plan,
        surfaceBaseline,
        migrationLab,
        rollbackReport: createEvolutionRollbackReport({
          action,
          plan,
        }),
      });
    }
    return writeEvolutionResult(input, action, {
      ...plan,
      surfaceBaseline,
      migrationLab,
      receiptPreview: createEvolutionReceipt({
        action: action as ClawEvolutionOperatorAction,
        plan,
        notes: ["planned operator action; mutation requires explicit approval when gated"],
      }),
    });
  }

  return writeEvolutionUsage(input);
}

function writeEvolutionUsage(input: EvolutionCliInput): number {
  input.context.stderr.write(`Usage: ${input.binName} evolution list|show|diff|plan|dry-run|apply|verify|doctor|repair|rollback|backup|receipt|report [--root PATH] [--json]\n`);
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
      steward: record.steward,
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

function readPublicSurfaceBaseline(file: string): ClawEvolutionPublicSurfaceBaseline | null {
  if (!fs.existsSync(file)) return null;
  return clawEvolutionPublicSurfaceBaselineSchema.parse(JSON.parse(fs.readFileSync(file, "utf8")));
}

function readEvolutionFixtures(directory: string): ClawEvolutionVersionFixture[] {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory)
    .filter((entry) => entry.endsWith(".json"))
    .sort()
    .map((entry) => clawEvolutionVersionFixtureSchema.parse(JSON.parse(fs.readFileSync(path.join(directory, entry), "utf8"))));
}

function createCurrentPublicSurfaceBaseline(): ClawEvolutionPublicSurfaceBaseline {
  return createEvolutionPublicSurfaceBaseline({
    generatedAt: "CURRENT",
    surfaces: clawPersistentSurfaceRegistry.nodes,
    cliCommands: clawCliCommandRegistry.commands,
  });
}

function isRecordList(value: unknown): value is { records: ClawEvolutionLedger["records"] } {
  return !!value && typeof value === "object" && Array.isArray((value as { records?: unknown }).records);
}
