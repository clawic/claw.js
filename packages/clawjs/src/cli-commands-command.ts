import { createHash } from "crypto"; import fs from "fs"; import path from "path";  import {   CLAW_CLI_COMMAND_INTENT_STATUSES, dedupeNeedOpportunities, resolveClawPersistentSurfacePath } from "@clawjs/core";
import { commandIntentToNeedOpportunity, mergeClawCliCommandIntentEntries, normalizeClawCliCommandIntentPhrase, normalizeCommandIntentEntry, resolveClawCliCommandIntent } from "@clawjs/core/catalogs";
import type { NeedOpportunity } from "@clawjs/core";
import type { ClawCliCommandIntentEntry, ClawCliCommandIntentSource, ClawCliCommandIntentStatus } from "@clawjs/core/catalogs";

import { CliHandledError, CLI_EXIT_OK, CLI_EXIT_USAGE } from "./cli-errors.ts";
import { formatCliTable } from "./cli-flag-parsers.ts";
import { writeCommandJsonOk } from "./cli-json.ts";

interface CommandsCliInput {
  positionals: string[];
  flags: Record<string, string>;
  argv: string[];
  context: {
    stdout: NodeJS.WritableStream;
    stderr: NodeJS.WritableStream;
    cwd: string;
  };
  wantsJson: boolean;
  binName: string;
  workspaceRoot: string;
}

interface CommandIntentLedger {
  schemaVersion: 1;
  intents: ClawCliCommandIntentEntry[];
  updatedAt: string;
}

export async function runCommandsCli(input: CommandsCliInput): Promise<number> {
  const action = input.positionals[1];
  if (!action) return writeCommandsUsage(input);

  if (action === "resolve") {
    const phrase = resolvePhrase(input, 2);
    if (!phrase) throw new CliHandledError("missing_command_intent_phrase", `Usage: ${input.binName} commands resolve <phrase> --json`, CLI_EXIT_USAGE);
    const ledger = readCommandIntentLedger(input.workspaceRoot);
    return writeCommandsResult(input, {
      resolution: resolveClawCliCommandIntent({ phrase, ledgerEntries: ledger.intents }),
      ledgerPath: commandIntentLedgerPath(input.workspaceRoot),
    });
  }

  if (action === "record") {
    const phrase = resolvePhrase(input, 2);
    const purpose = input.flags.purpose || input.flags.for || input.flags.use;
    if (!phrase || !purpose) throw new CliHandledError("missing_command_intent_record_fields", `Usage: ${input.binName} commands record --phrase <phrase> --purpose <purpose> --json`, CLI_EXIT_USAGE);
    const ledger = readCommandIntentLedger(input.workspaceRoot);
    const resolution = resolveClawCliCommandIntent({ phrase, ledgerEntries: ledger.intents });
    const status = parseStatus(input.flags.status) ?? resolution.status;
    const now = new Date().toISOString();
    const record = normalizeCommandIntentEntry({
      ...resolution.intent,
      id: commandIntentId(phrase, purpose),
      phrase,
      normalizedPhrase: normalizeClawCliCommandIntentPhrase(phrase),
      language: input.flags.language || input.flags.lang || "und",
      purpose,
      status,
      source: "ledger",
      evidence: [`Explicitly recorded by workspace user at ${now}.`, ...resolution.intent.evidence],
      nextSteps: resolution.intent.nextSteps.length ? resolution.intent.nextSteps : ["Review with `claw commands opportunities --json` before promotion."],
      createdAt: now,
      updatedAt: now,
    }, "ledger");
    const next: CommandIntentLedger = {
      schemaVersion: 1,
      intents: mergeById(ledger.intents, [record]).map((entry) => normalizeCommandIntentEntry(entry, "ledger")),
      updatedAt: now,
    };
    writeCommandIntentLedger(input.workspaceRoot, next);
    return writeCommandsResult(input, { record, resolution, ledgerPath: commandIntentLedgerPath(input.workspaceRoot) });
  }

  if (action === "list") {
    const entries = filterEntries(input, mergeClawCliCommandIntentEntries(readCommandIntentLedger(input.workspaceRoot).intents));
    return writeCommandsResult(input, { intents: entries, ledgerPath: commandIntentLedgerPath(input.workspaceRoot), statuses: CLAW_CLI_COMMAND_INTENT_STATUSES });
  }

  if (action === "opportunities") {
    const entries = filterEntries(input, mergeClawCliCommandIntentEntries(readCommandIntentLedger(input.workspaceRoot).intents));
    const opportunities = entries.map(commandIntentToNeedOpportunity).filter((entry): entry is NeedOpportunity => !!entry);
    return writeCommandsResult(input, {
      opportunities: dedupeNeedOpportunities(opportunities),
      ledgerPath: commandIntentLedgerPath(input.workspaceRoot),
      routeId: "cli.commandIntentResolution",
    });
  }

  if (action === "promote") {
    const id = input.positionals[2] || input.flags.id;
    if (!id) throw new CliHandledError("missing_command_intent_id", `Usage: ${input.binName} commands promote <id> [--to report] --json`, CLI_EXIT_USAGE);
    const target = input.flags.to || "report";
    if (target !== "report") throw new CliHandledError("unsupported_command_intent_promotion_target", "Command intents can only promote to report in V1.", CLI_EXIT_USAGE);
    const entries = mergeClawCliCommandIntentEntries(readCommandIntentLedger(input.workspaceRoot).intents);
    const entry = entries.find((candidate) => candidate.id === id || candidate.normalizedPhrase === normalizeClawCliCommandIntentPhrase(id));
    if (!entry) throw new CliHandledError("command_intent_not_found", `No command intent found for ${id}.`, CLI_EXIT_USAGE);
    return writeCommandsResult(input, {
      promotion: buildPromotionPacket(input, entry),
      destructiveActionsAllowed: false,
      requiresApproval: true,
    });
  }

  return writeCommandsUsage(input);
}

function writeCommandsUsage(input: CommandsCliInput): number {
  const usage = [
    `Usage: ${input.binName} commands resolve|record|list|opportunities|promote [options]`,
    "",
    "Commands:",
    "  commands resolve <phrase> --json",
    "  commands record --phrase <phrase> --purpose <purpose> --json",
    "  commands list [--status gap] [--source registry|ledger] --json",
    "  commands opportunities [--status gap] --json",
    "  commands promote <id> --to report --json",
  ].join("\n");
  input.context.stderr.write(`${usage}\n`);
  return CLI_EXIT_USAGE;
}

function writeCommandsResult(input: CommandsCliInput, data: unknown): number {
  if (input.wantsJson) {
    writeCommandJsonOk(input.context.stdout, "commands", data, {
      subcommand: input.positionals[1] ?? null,
      operation: input.positionals[2] ?? null,
    });
    return CLI_EXIT_OK;
  }
  if (isIntentListPayload(data)) {
    input.context.stdout.write(`${formatCliTable(data.intents.map((entry) => ({
      id: entry.id,
      status: entry.status,
      source: entry.source,
      phrase: entry.phrase,
      command: entry.mappedCommand ?? "",
    })))}\n`);
    return CLI_EXIT_OK;
  }
  if (isResolutionPayload(data)) {
    const { resolution } = data;
    input.context.stdout.write(`${resolution.intent.phrase}\t${resolution.status}\t${resolution.intent.mappedCommand ?? "unmapped"}\n${resolution.nextSteps.join("\n")}\n`);
    return CLI_EXIT_OK;
  }
  input.context.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
  return CLI_EXIT_OK;
}

function resolvePhrase(input: CommandsCliInput, startIndex: number): string {
  return input.flags.phrase || input.positionals.slice(startIndex).join(" ");
}

function parseStatus(value: string | undefined): ClawCliCommandIntentStatus | undefined {
  if (!value) return undefined;
  if ((CLAW_CLI_COMMAND_INTENT_STATUSES as string[]).includes(value)) return value as ClawCliCommandIntentStatus;
  throw new CliHandledError("invalid_command_intent_status", `Use one of: ${CLAW_CLI_COMMAND_INTENT_STATUSES.join(", ")}.`, CLI_EXIT_USAGE);
}

function filterEntries(input: CommandsCliInput, entries: ClawCliCommandIntentEntry[]): ClawCliCommandIntentEntry[] {
  const status = parseStatus(input.flags.status);
  const source = parseSource(input.flags.source);
  return entries.filter((entry) => (!status || entry.status === status) && (!source || entry.source === source));
}

function parseSource(value: string | undefined): ClawCliCommandIntentSource | undefined {
  if (!value) return undefined;
  if (value === "registry" || value === "ledger") return value;
  throw new CliHandledError("invalid_command_intent_source", "Use --source registry or --source ledger.", CLI_EXIT_USAGE);
}

function buildPromotionPacket(input: CommandsCliInput, entry: ClawCliCommandIntentEntry): {
  commandIntentId: string;
  target: "report";
  commandPlan: string[];
  reportDraft: {
    type: "bug" | "feature";
    title: string;
    body: string;
    labels: string[];
    destination: ClawCliCommandIntentEntry["reportTarget"];
  };
} {
  const type = entry.status === "blocked" ? "feature" : "feature";
  const title = `CLI command intent: ${entry.phrase}`;
  const body = [
    entry.purpose,
    "",
    `Status: ${entry.status}`,
    `Mapped command: ${entry.mappedCommand ?? "none"}`,
    `Risk: ${entry.risk.join(", ") || "none"}`,
    "",
    "Evidence:",
    ...entry.evidence.map((item) => `- ${item}`),
    "",
    "Next steps:",
    ...entry.nextSteps.map((item) => `- ${item}`),
  ].join("\n");
  return {
    commandIntentId: entry.id,
    target: "report",
    commandPlan: [
      `${input.binName} report ${type} --title ${JSON.stringify(title)} --body-file <reviewed-body.md> --json`,
    ],
    reportDraft: {
      type,
      title,
      body,
      labels: ["cli-command-intent", entry.status, entry.source],
      destination: entry.reportTarget,
    },
  };
}

function commandIntentLedgerPath(workspaceRoot: string): string {
  return resolveClawPersistentSurfacePath("claw.workspace.command_intents.ledger", workspaceRoot);
}

function readCommandIntentLedger(workspaceRoot: string): CommandIntentLedger {
  const file = commandIntentLedgerPath(workspaceRoot);
  if (!fs.existsSync(file)) return { schemaVersion: 1, intents: [], updatedAt: new Date(0).toISOString() };
  return normalizeCommandIntentLedger(JSON.parse(fs.readFileSync(file, "utf8")));
}

function writeCommandIntentLedger(workspaceRoot: string, ledger: CommandIntentLedger): void {
  const file = commandIntentLedgerPath(workspaceRoot);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(normalizeCommandIntentLedger(ledger), null, 2)}\n`);
}

function normalizeCommandIntentLedger(value: unknown): CommandIntentLedger {
  const state = value && typeof value === "object" ? value as Partial<CommandIntentLedger> : {};
  return {
    schemaVersion: 1,
    intents: Array.isArray(state.intents) ? state.intents.map((entry) => normalizeCommandIntentEntry(entry, "ledger")) : [],
    updatedAt: typeof state.updatedAt === "string" ? state.updatedAt : new Date().toISOString(),
  };
}

function commandIntentId(phrase: string, purpose: string): string {
  const hash = createHash("sha256").update(`${normalizeClawCliCommandIntentPhrase(phrase)}\n${purpose}`).digest("hex").slice(0, 10);
  const slug = normalizeClawCliCommandIntentPhrase(phrase).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48) || "intent";
  return `cmd_intent_${slug}_${hash}`;
}

function mergeById<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  return [...new Map([...current, ...incoming].map((entry) => [entry.id, entry])).values()];
}

function isIntentListPayload(value: unknown): value is { intents: ClawCliCommandIntentEntry[] } {
  return !!value && typeof value === "object" && Array.isArray((value as { intents?: unknown }).intents);
}

function isResolutionPayload(value: unknown): value is { resolution: ReturnType<typeof resolveClawCliCommandIntent> } {
  return !!value && typeof value === "object" && !!(value as { resolution?: unknown }).resolution;
}
