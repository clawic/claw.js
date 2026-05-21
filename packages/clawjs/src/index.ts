import { CLI_EXIT_OK, CLI_EXIT_USAGE, CliHandledError } from "./cli-errors.ts";
export { CLI_EXIT_DEGRADED, CLI_EXIT_FAILURE, CLI_EXIT_OK, CLI_EXIT_USAGE } from "./cli-errors.ts";
import { extractPositionals, parseFlags } from "./cli-flag-parsers.ts";
import { cliErrorFromUnknown, setCliJsonMetaProvider, writeCommandJsonError, writeCommandJsonOk, writeJsonError } from "./cli-json.ts";
import {
  CLI_USAGE,
  DEFAULT_CLI_BIN,
  REMOVED_RUNTIME_COMMANDS,
  REMOVED_V1_CRUD_COMMANDS,
  buildCliUsage,
  buildCommandHelp,
  normalizePublicCliArgv,
  relatedCliMatches,
  removedPublicCommandMessage,
} from "./cli-surface.ts";
export { CLI_USAGE, DEFAULT_CLI_BIN, buildCliUsage } from "./cli-surface.ts";
import { writeMissingSubcommandJsonHelp, writePublicPortalHelpOnly } from "./cli-public-portal-routes.ts";
import { GENERATED_CLI_ROUTE_GROUPS, GENERATED_COLLECTION_ALIASES, type GeneratedCliRouteGroup } from "./cli-router.generated.ts";

export interface CliContext {
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
  stdin?: NodeJS.ReadableStream;
  cwd: string;
  binName?: string;
  runCommand?: (command: string, args: string[], options: { cwd: string }) => Promise<void>;
}

export interface CliInvocation {
  argv: string[];
  positionals: string[];
  flags: Record<string, string>;
  context: CliContext;
  wantsJson: boolean;
  binName: string;
  group?: string;
  command?: string;
  subcommand?: string;
  routeGroup: GeneratedCliRouteGroup;
}

export type CliRouteHandler = (invocation: CliInvocation) => Promise<number>;

const REMOVED_CONTENT_PORTAL_COMMANDS = new Set(["posts", "campaigns", "publications"]);

async function runCliUnsafe(argv: string[], context: CliContext): Promise<number> {
  const binName = context.binName?.trim() || DEFAULT_CLI_BIN;
  argv = normalizePublicCliArgv(argv, context.stderr, binName);
  const positionals = extractPositionals(argv);
  const [group, command, subcommand] = positionals;
  const wantsJson = argv.includes("--json");
  const flags = parseFlags(argv);
  const usage = buildCliUsage(binName, { all: argv.includes("--all") });
  const wantsHelp = argv.includes("--help") || argv.includes("-h");
  const canonicalCommand = canonicalCommandFor(group);

  const removedMessage = group ? removedPublicCommandMessage(group, binName) : null;
  if (removedMessage) {
    if (wantsJson) {
      writeCommandJsonError(context.stdout, group, new CliHandledError("removed_public_command", removedMessage, CLI_EXIT_USAGE), {
        invokedCommand: group,
        subcommand: command ?? null,
        related: relatedCliMatches(group, { limit: 12 }),
      });
    } else {
      context.stderr.write(`${removedMessage}\n`);
    }
    return CLI_EXIT_USAGE;
  }

  const removedPublicCommandExit = writeRemovedSubcommandIfNeeded({ group, command, wantsJson, context, binName, canonicalCommand });
  if (removedPublicCommandExit !== null) return removedPublicCommandExit;

  if (wantsHelp || group === "help") {
    if (!group || group === "help") {
      context.stdout.write(`${usage}\n`);
      return CLI_EXIT_OK;
    }
    const commandHelp = buildCommandHelp(binName, group);
    context.stdout.write(`${commandHelp ?? usage}\n`);
    return CLI_EXIT_OK;
  }

  if (!group) {
    context.stderr.write(`${usage}\n`);
    return CLI_EXIT_USAGE;
  }

  const missingSubcommandJsonExit = writeMissingSubcommandJsonHelp({ group, command, wantsJson, context, binName, usage });
  if (missingSubcommandJsonExit !== null) return missingSubcommandJsonExit;

  const portalHelpOnlyExit = writePublicPortalHelpOnly({ group, command, subcommand, wantsJson, context, binName, usage });
  if (portalHelpOnlyExit !== null) return portalHelpOnlyExit;

  const baseSearchExit = writeBaseSearchResultIfPossible({ group, command, subcommand, positionals, context, wantsJson });
  if (baseSearchExit !== null) return baseSearchExit;

  const baseSetupExit = await runBaseSetupOrModulesIfPossible({ group, positionals, flags, argv, context, wantsJson });
  if (baseSetupExit !== null) return baseSetupExit;

  const baseInspectExit = writeBaseInspectIfPossible({ group, command, context, wantsJson });
  if (baseInspectExit !== null) return baseInspectExit;

  if (!hasGeneratedCliRoute(group) && !isGeneratedCollectionAlias(group)) {
    return await handleUnknownCliCommand({ group, positionals, context, wantsJson, usage });
  }

  const missingOptionalPackExit = await writeMissingOptionalPackIfNeeded({ group, context, wantsJson });
  if (missingOptionalPackExit !== null) return missingOptionalPackExit;

  const routeGroup = routeGroupForCommand(group);
  return await runGeneratedCliRoute({
    argv,
    positionals,
    flags,
    context,
    wantsJson,
    binName,
    group,
    command,
    subcommand,
    routeGroup,
  });
}

export async function runCli(argv: string[], context: CliContext): Promise<number> {
  const wantsJson = argv.includes("--json");
  try {
    return await runCliUnsafe(argv, context);
  } catch (error) {
    const handled = cliErrorFromUnknown(error);
    if (wantsJson) {
      const [group, command, subcommand] = extractPositionals(argv);
      const canonicalCommand = canonicalCommandFor(group);
      writeCommandJsonError(context.stdout, canonicalCommand, handled, {
        invokedCommand: group ?? canonicalCommand,
        subcommand: command ?? null,
        ...(subcommand ? { operation: subcommand } : {}),
      });
    } else {
      context.stderr.write(`${handled.message}\n`);
    }
    return handled.exitCode;
  } finally {
    setCliJsonMetaProvider(null);
  }
}

async function runGeneratedCliRoute(invocation: CliInvocation): Promise<number> {
  switch (invocation.routeGroup) {
    case "inspect-search-governance":
    case "database-productivity":
    case "host-system-network":
    case "remote-sync":
    case "runtime-workspace":
    case "media-documents":
    case "scaffold-setup":
    case "domain-data":
    case "legacy": {
      const { runCli: runLegacyCli } = await import("./cli-legacy.ts");
      return await runLegacyCli(invocation.argv, invocation.context);
    }
  }
}

function routeGroupForCommand(group: string): GeneratedCliRouteGroup {
  return GENERATED_CLI_ROUTE_GROUPS[group as keyof typeof GENERATED_CLI_ROUTE_GROUPS] ?? "legacy";
}

function hasGeneratedCliRoute(group: string): boolean {
  return group in GENERATED_CLI_ROUTE_GROUPS;
}

function isGeneratedCollectionAlias(group: string): boolean {
  return group.toLowerCase() in GENERATED_COLLECTION_ALIASES;
}

function canonicalCommandFor(group: string | undefined): string {
  return group === "db" ? "database"
    : group === "provider" ? "providers"
      : group === "style" ? "styles"
        : group === "template" ? "templates"
          : group === "ref" ? "references"
            : group === "image" ? "images"
              : group ?? "claw";
}

function writeRemovedSubcommandIfNeeded(input: {
  group: string | undefined;
  command: string | undefined;
  wantsJson: boolean;
  context: CliContext;
  binName: string;
  canonicalCommand: string;
}): number | null {
  const { group, command, wantsJson, context, binName, canonicalCommand } = input;
  if ((group === "runtime" || group === "monitor") && command && REMOVED_RUNTIME_COMMANDS.has(command)) {
    const detail = group === "runtime"
      ? "Runtime is limited to adapters and setup."
      : "Monitor is limited to health, uptime, incidents, metrics and dashboards.";
    return writeRemovedJsonOrText({ wantsJson, context, canonicalCommand, message: `\`${binName} ${group} ${command}\` is not part of the public Claw CLI surface. ${detail}` });
  }
  if ((group === "business" || group === "social") && command && REMOVED_V1_CRUD_COMMANDS.has(command)) {
    return writeRemovedJsonOrText({ wantsJson, context, canonicalCommand, message: `\`${binName} ${group} ${command}\` is removed pre-v1 CRUD and is not part of the public Claw CLI surface. Use the ${group} portal help to pick a supported route.` });
  }
  if (group === "content" && command && REMOVED_V1_CRUD_COMMANDS.has(command)) {
    return writeRemovedJsonOrText({ wantsJson, context, canonicalCommand, message: `\`${binName} content ${command}\` is removed pre-v1 CRUD and is not part of the public Claw CLI surface. Use content brand, destination, campaign, entry, approval, or publish commands.` });
  }
  if (group === "content" && command && REMOVED_CONTENT_PORTAL_COMMANDS.has(command)) {
    return writeRemovedJsonOrText({ wantsJson, context, canonicalCommand, message: `\`${binName} content ${command}\` is removed pre-v1 portal shorthand and is not part of the public Claw CLI surface. Use content brand, destination, campaign, entry, approval, or publish commands.` });
  }
  return null;
}

function writeRemovedJsonOrText(input: {
  wantsJson: boolean;
  context: CliContext;
  canonicalCommand: string;
  message: string;
}): number {
  if (input.wantsJson) {
    writeCommandJsonError(input.context.stdout, input.canonicalCommand, new CliHandledError("removed_public_command", input.message, CLI_EXIT_USAGE));
  } else {
    input.context.stderr.write(`${input.message}\n`);
  }
  return CLI_EXIT_USAGE;
}

function writeBaseSearchResultIfPossible(input: {
  group: string;
  command: string | undefined;
  subcommand: string | undefined;
  positionals: string[];
  context: CliContext;
  wantsJson: boolean;
}): number | null {
  const searchSubcommands = new Set([
    "query",
    "sources",
    "status",
    "service",
    "rebuild",
    "changes",
    "saved",
    "monitors",
    "actions",
    "audit",
    "source-sets",
    "explain",
    "profiles",
    "jobs",
  ]);
  if (input.group !== "search" || !input.command || input.subcommand || searchSubcommands.has(input.command)) return null;
  const query = input.positionals.slice(1).join(" ").trim();
  const results = relatedCliMatches(query, { limit: 10 });
  const payload = {
    query,
    scope: { mode: "generated-cli-router" },
    results,
  };
  if (input.wantsJson) {
    writeCommandJsonOk(input.context.stdout, "search", payload, { invokedCommand: "search", subcommand: query });
  } else {
    input.context.stdout.write(`${results.map((result) => `${result.name}\t${result.summary}`).join("\n")}\n`);
  }
  return CLI_EXIT_OK;
}

async function runBaseSetupOrModulesIfPossible(input: {
  group: string;
  positionals: string[];
  flags: Record<string, string>;
  argv: string[];
  context: CliContext;
  wantsJson: boolean;
}): Promise<number | null> {
  if (input.group === "setup") {
    const { runSetupCli } = await import("./cli-modules-command.ts");
    return await runSetupCli(input);
  }
  if (input.group === "modules") {
    const { runModulesCli } = await import("./cli-modules-command.ts");
    return await runModulesCli(input);
  }
  return null;
}

function writeBaseInspectIfPossible(input: {
  group: string;
  command: string | undefined;
  context: CliContext;
  wantsJson: boolean;
}): number | null {
  if (input.group !== "inspect" || (input.command !== "commands" && input.command !== "cli")) return null;
  const commands = Object.keys(GENERATED_CLI_ROUTE_GROUPS).map((command) => ({ id: `claw.cli.command.${command}`, value: command }));
  if (input.wantsJson) {
    writeCommandJsonOk(input.context.stdout, "inspect", commands, { subcommand: input.command });
  } else {
    input.context.stdout.write(`${commands.map((entry) => entry.value).join("\n")}\n`);
  }
  return CLI_EXIT_OK;
}

async function writeMissingOptionalPackIfNeeded(input: {
  group: string;
  context: CliContext;
  wantsJson: boolean;
}): Promise<number | null> {
  const localDataGroups = new Set(["db", "records", "tasks", "task", "notes", "note", "projects", "project", "people", "person", "goals", "goal", "reminders", "reminder", "deadlines", "deadline", "work", "memory"]);
  const runtimeGroups = new Set(["chat", "provider", "code", "runtime", "workspace"]);
  const missingClawRuntime = !(await hasPackage("@clawjs/claw"));
  if (missingClawRuntime && localDataGroups.has(input.group)) {
    return writeOptionalPackMissing(input, "local-data", "@clawjs/local-data");
  }
  if (missingClawRuntime && runtimeGroups.has(input.group)) {
    return writeOptionalPackMissing(input, "dev-diagnostics", "@clawjs/claw");
  }
  return null;
}

async function hasPackage(packageName: string): Promise<boolean> {
  try {
    await import(packageName);
    return true;
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "ERR_MODULE_NOT_FOUND" || code === "MODULE_NOT_FOUND") return false;
    throw error;
  }
}

function writeOptionalPackMissing(input: {
  group: string;
  context: CliContext;
  wantsJson: boolean;
}, moduleId: string, optionalPack: string): number {
  const message = `This command needs optional pack ${optionalPack}. Review it with \`claw modules install ${moduleId}\` and install the pack explicitly before using this capability.`;
  if (input.wantsJson) {
    writeCommandJsonError(input.context.stdout, input.group, new CliHandledError("optional_pack_missing", message, CLI_EXIT_USAGE), { requiredModule: moduleId, optionalPack });
  } else {
    input.context.stderr.write(`${message}\n`);
  }
  return CLI_EXIT_USAGE;
}

async function handleUnknownCliCommand(input: {
  group: string;
  positionals: string[];
  context: CliContext;
  wantsJson: boolean;
  usage: string;
}): Promise<number> {
  const phrase = input.positionals.length ? input.positionals.join(" ") : input.group;
  const related = relatedCliMatches(phrase, { limit: 5 });
  const commandIntent = await resolveCommandIntent(phrase);
  if (input.wantsJson) {
    writeJsonError(
      input.context.stdout,
      new CliHandledError("unknown_command", `Unknown Claw CLI command: ${input.group}`, CLI_EXIT_USAGE),
      {
        schemaVersion: 1,
        canonicalCommand: null,
        related,
        commandIntent,
      },
    );
    return CLI_EXIT_USAGE;
  }
  if (related.length > 0) {
    input.context.stderr.write(`Unknown command: ${input.group}\nRelated:\n${related.map((entry) => `  ${entry.name}${entry.canonicalCommand ? ` -> ${entry.canonicalCommand}` : ""} (${entry.type})`).join("\n")}\n\n`);
  }
  input.context.stderr.write(`Intent: ${commandIntent.status}. Try: ${input.context.binName ?? "claw"} commands resolve ${JSON.stringify(phrase)} --json\n\n`);
  input.context.stderr.write(`${input.usage}\n`);
  return CLI_EXIT_USAGE;
}

async function resolveCommandIntent(phrase: string): Promise<{ status: string; execute: boolean; intent?: unknown }> {
  try {
    const core = await import("@clawjs/core/catalogs");
    if (typeof core.resolveClawCliCommandIntent === "function") {
      return core.resolveClawCliCommandIntent({ phrase }) as { status: string; execute: boolean; intent?: unknown };
    }
  } catch {
    // Keep unknown-command handling usable even when optional built artifacts are absent.
  }
  return { status: "gap", execute: false };
}
