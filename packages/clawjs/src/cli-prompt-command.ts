import {
  INSTRUCTION_ACTIONS,
  INSTRUCTION_INPUT_KINDS,
  isInstructionTrigger,
  listMaterializedSeedInstructions,
  renderInstructionsMarkdown,
  renderInstructionsPayload,
  resolveInstructionsForEvent,
  type ClawInstruction,
  type InstructionEvent,
  type InstructionTarget,
  type InstructionTrigger,
  type RenderTier,
} from "@clawjs/core/catalogs";

import { CLI_EXIT_FAILURE, CLI_EXIT_OK, CLI_EXIT_USAGE, CliHandledError } from "./cli-errors.ts";
import { listPluginMaterializedSeedInstructions } from "./cli-instructions-plugin-seeds.ts";
import { writeCommandJsonError, writeCommandJsonOk } from "./cli-json.ts";
import { openMainDataStore } from "./v1-data-core.ts";

const NAMESPACE = "main";
const COLLECTION = "instructions";
const CANONICAL_COMMAND = "prompt";

const RENDER_TIERS: RenderTier[] = ["skeleton", "compact", "full"];

export interface PromptCliInput {
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

function usage(binName: string): string {
  return [
    `Usage: ${binName} prompt <scope> [options]`,
    "",
    "Scopes:",
    `  session-start [--tier=skeleton|compact|full] [--budget=N]`,
    `  user-turn [--tier=...] [--budget=N]`,
    `  for-action <command> <action> [--tier=...] [--budget=N]`,
    `  for-alias <alias> [--tier=...] [--budget=N]`,
    `  for-collection <collection> [<action>] [--tier=...] [--budget=N]`,
    `  input <kind> [--tier=...] [--budget=N]   (audio|image|video|file|url|text)`,
    "",
    "Common flags:",
    "  --json                                emit a JSON payload alongside the markdown",
    "  --tier=skeleton|compact|full          render granularity (default compact)",
    "  --budget=<integer>                    approximate token cap (default 2048)",
  ].join("\n");
}

function parseTier(flag: string | undefined): RenderTier {
  if (flag === undefined) return "compact";
  if (!(RENDER_TIERS as string[]).includes(flag)) {
    throw new CliHandledError(
      "invalid_tier",
      `Unknown --tier ${flag}. Expected one of: ${RENDER_TIERS.join(", ")}.`,
      CLI_EXIT_USAGE,
    );
  }
  return flag as RenderTier;
}

function parseBudget(flag: string | undefined): number | undefined {
  if (flag === undefined) return undefined;
  const parsed = Number.parseInt(flag, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new CliHandledError("invalid_budget", `--budget must be a positive integer.`, CLI_EXIT_USAGE);
  }
  return parsed;
}

function loadInstructions(): ClawInstruction[] {
  const store = openMainDataStore();
  try {
    const { items } = store.listRecords(NAMESPACE, COLLECTION, { limit: 10_000 });
    return items.map((envelope) => {
      const data = envelope as Record<string, unknown>;
      const target: InstructionTarget = {};
      if (typeof data.targetAlias === "string") target.alias = data.targetAlias;
      if (typeof data.targetFamily === "string") target.family = data.targetFamily;
      if (typeof data.targetCommand === "string") target.command = data.targetCommand;
      if (typeof data.targetSubcommand === "string") target.subcommand = data.targetSubcommand;
      if (typeof data.targetCollection === "string") target.collection = data.targetCollection;
      if (typeof data.targetAction === "string") target.action = data.targetAction as InstructionTarget["action"];
      return {
        id: envelope.id,
        schemaVersion: 1,
        target,
        trigger: (data.trigger as InstructionTrigger) ?? "surface-action",
        activation: (data.activation as ClawInstruction["activation"]) ?? "on",
        priority: typeof data.priority === "number" ? data.priority : 50,
        severity: (data.severity as ClawInstruction["severity"]) ?? "info",
        useWhen: typeof data.useWhen === "string" ? data.useWhen : undefined,
        useNot: typeof data.useNot === "string" ? data.useNot : undefined,
        readPolicy: typeof data.readPolicy === "string" ? data.readPolicy : undefined,
        writePolicy: typeof data.writePolicy === "string" ? data.writePolicy : undefined,
        before: typeof data.before === "string" ? data.before : undefined,
        after: typeof data.after === "string" ? data.after : undefined,
        forbid: typeof data.forbid === "string" ? data.forbid : undefined,
        notes: typeof data.notes === "string" ? data.notes : undefined,
        provenance: (data.provenance as ClawInstruction["provenance"]) ?? "user",
        state: (data.state as ClawInstruction["state"]) ?? "active",
        confidence: typeof data.confidence === "number" ? data.confidence : undefined,
        proposedFrom: typeof data.proposedFrom === "string" ? data.proposedFrom : undefined,
        source: typeof data.source === "string" ? data.source : undefined,
        createdAt: typeof data.createdAt === "string" ? data.createdAt : "",
        updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : "",
      };
    });
  } finally {
    store.close();
  }
}

function buildEvent(scope: string, positionals: string[], flags: Record<string, string>, binName: string): { event: InstructionEvent; label: string } {
  switch (scope) {
    case "session-start":
      return { event: { target: { alias: "productivity" }, trigger: "session-start" }, label: "session-start" };
    case "user-turn":
      return { event: { target: { alias: "productivity" }, trigger: "user-turn" }, label: "user-turn" };
    case "for-action": {
      const command = positionals[2];
      const action = positionals[3];
      if (!command || !action) {
        throw new CliHandledError(
          "missing_args",
          `Usage: ${binName} prompt for-action <command> <action>`,
          CLI_EXIT_USAGE,
        );
      }
      if (!(INSTRUCTION_ACTIONS as string[]).includes(action)) {
        throw new CliHandledError("invalid_action", `Unknown action ${action}.`, CLI_EXIT_USAGE);
      }
      return {
        event: { target: { command, action: action as InstructionTarget["action"] }, trigger: "surface-action" },
        label: `for-action ${command} ${action}`,
      };
    }
    case "for-alias": {
      const alias = positionals[2];
      if (!alias) {
        throw new CliHandledError("missing_args", `Usage: ${binName} prompt for-alias <alias>`, CLI_EXIT_USAGE);
      }
      return { event: { target: { alias }, trigger: "surface-action" }, label: `for-alias ${alias}` };
    }
    case "for-collection": {
      const collection = positionals[2];
      const action = positionals[3];
      if (!collection) {
        throw new CliHandledError("missing_args", `Usage: ${binName} prompt for-collection <collection> [<action>]`, CLI_EXIT_USAGE);
      }
      const target: InstructionTarget = { collection };
      if (action) {
        if (!(INSTRUCTION_ACTIONS as string[]).includes(action)) {
          throw new CliHandledError("invalid_action", `Unknown action ${action}.`, CLI_EXIT_USAGE);
        }
        target.action = action as InstructionTarget["action"];
      }
      return { event: { target, trigger: "surface-action" }, label: `for-collection ${collection}${action ? ` ${action}` : ""}` };
    }
    case "input": {
      const kind = positionals[2];
      if (!kind || !(INSTRUCTION_INPUT_KINDS as string[]).includes(kind)) {
        throw new CliHandledError(
          "invalid_input_kind",
          `Usage: ${binName} prompt input <${INSTRUCTION_INPUT_KINDS.join("|")}>`,
          CLI_EXIT_USAGE,
        );
      }
      const trigger = `input-kind:${kind}` as InstructionTrigger;
      if (!isInstructionTrigger(trigger)) {
        throw new CliHandledError("invalid_input_kind", `Unknown input kind ${kind}.`, CLI_EXIT_USAGE);
      }
      return { event: { target: { alias: "productivity" }, trigger }, label: `input ${kind}` };
    }
    default:
      throw new CliHandledError(
        "unknown_scope",
        `Unknown prompt scope ${scope}. See ${binName} prompt --help.`,
        CLI_EXIT_USAGE,
      );
  }
}

export async function runPromptCli(input: PromptCliInput): Promise<number> {
  const scope = input.positionals[1];
  if (!scope) {
    input.context.stderr.write(`${usage(input.binName)}\n`);
    return CLI_EXIT_USAGE;
  }
  try {
    const { event, label } = buildEvent(scope, input.positionals, input.flags, input.binName);
    const tier = parseTier(input.flags.tier);
    const budgetTokens = parseBudget(input.flags.budget);

    const seeds = listMaterializedSeedInstructions();
    const pluginSeeds = listPluginMaterializedSeedInstructions(input.context.cwd);
    const overrides = loadInstructions();
    const resolved = resolveInstructionsForEvent([...seeds, ...pluginSeeds, ...overrides], event);
    const payload = renderInstructionsPayload(resolved, event, {
      tier,
      ...(typeof budgetTokens === "number" ? { budgetTokens } : {}),
      binName: input.binName,
    });
    const markdown = renderInstructionsMarkdown(payload);

    if (input.wantsJson) {
      writeCommandJsonOk(
        input.context.stdout,
        CANONICAL_COMMAND,
        { ...payload, markdown },
        { canonicalCommand: CANONICAL_COMMAND, operation: label },
      );
      return CLI_EXIT_OK;
    }
    input.context.stdout.write(`${markdown}\n`);
    return CLI_EXIT_OK;
  } catch (error) {
    if (input.wantsJson) {
      writeCommandJsonError(input.context.stdout, CANONICAL_COMMAND, error, { canonicalCommand: CANONICAL_COMMAND });
      return error instanceof CliHandledError ? error.exitCode : CLI_EXIT_FAILURE;
    }
    if (error instanceof CliHandledError) {
      input.context.stderr.write(`${error.message}\n`);
      return error.exitCode;
    }
    input.context.stderr.write(`${(error as Error).message}\n`);
    return CLI_EXIT_FAILURE;
  }
}
