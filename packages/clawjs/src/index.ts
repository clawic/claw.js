import os from "node:os";
import { CLI_EXIT_OK, CLI_EXIT_USAGE, CliHandledError, formatCliErrorText } from "./cli-errors.ts";
export { CLI_EXIT_DEGRADED, CLI_EXIT_FAILURE, CLI_EXIT_OK, CLI_EXIT_USAGE } from "./cli-errors.ts";
import { resolveCliPackageVersion } from "./cli-legacy-open.ts";
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
import { runVerifyCli } from "./cli-verify-command.ts";

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
const CORE_CATALOGS_MODULE = ["@clawjs/core", "catalogs"].join("/");

interface CoreCatalogsRuntime {
  resolveBuiltinCollectionName?: (group: string) => string | undefined;
  resolveClawCliCommandIntent?: (input: { phrase: string }) => { status: string; execute: boolean; intent?: unknown };
}

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

  if (!group && argv.length === 1 && (argv[0] === "--version" || argv[0] === "-v")) {
    context.stdout.write(`${resolveCliPackageVersion() ?? "unknown"}\n`);
    return CLI_EXIT_OK;
  }

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
    const helpTarget = group === "help" ? command : group;
    if (wantsJson) {
      if (!helpTarget) {
        writeCommandJsonOk(context.stdout, "claw", { command: "claw", help: usage }, { invokedCommand: group ?? "claw", subcommand: command ?? null });
        return CLI_EXIT_OK;
      }
      const targetCanonicalCommand = canonicalCommandFor(helpTarget);
      const commandHelp = buildCommandHelp(binName, helpTarget);
      if (!commandHelp) {
        writeCommandJsonError(context.stdout, targetCanonicalCommand, new CliHandledError("unknown_help_topic", `No help topic found for ${helpTarget}.`, CLI_EXIT_USAGE, {
          safeNextStep: `Run ${binName} search ${JSON.stringify(helpTarget)} --json or ${binName} inspect commands --json.`,
          details: {
            topic: helpTarget,
            related: relatedCliMatches(helpTarget, { limit: 8 }),
          },
        }), {
          invokedCommand: group ?? helpTarget,
          subcommand: group === "help" ? helpTarget : command ?? null,
        });
        return CLI_EXIT_USAGE;
      }
      writeCommandJsonOk(context.stdout, targetCanonicalCommand, { command: targetCanonicalCommand, help: commandHelp }, {
        invokedCommand: group ?? helpTarget,
        subcommand: group === "help" ? helpTarget : command ?? null,
        ...(subcommand ? { operation: subcommand } : {}),
      });
      return CLI_EXIT_OK;
    }
    if (!helpTarget) {
      context.stdout.write(`${usage}\n`);
      return CLI_EXIT_OK;
    }
    const commandHelp = buildCommandHelp(binName, helpTarget);
    if (!commandHelp) {
      context.stderr.write(`No help topic found for ${helpTarget}. Run ${binName} search ${JSON.stringify(helpTarget)} --json or ${binName} inspect commands --json.\n`);
      return CLI_EXIT_USAGE;
    }
    context.stdout.write(`${commandHelp}\n`);
    return CLI_EXIT_OK;
  }

  if (!group) {
    context.stderr.write(`${usage}\n`);
    return CLI_EXIT_USAGE;
  }

  const missingSubcommandJsonExit = writeMissingSubcommandJsonHelp({ group, command, wantsJson, context, binName, usage });
  if (missingSubcommandJsonExit !== null) return missingSubcommandJsonExit;

  if (!command) {
    const portalHelpOnlyExit = writePublicPortalHelpOnly({ group, command, subcommand, wantsJson, context, binName, usage });
    if (portalHelpOnlyExit !== null) return portalHelpOnlyExit;
  }

  const baseSetupExit = await runBaseSetupOrModulesIfPossible({ group, positionals, flags, argv, context, wantsJson });
  if (baseSetupExit !== null) return baseSetupExit;

  const baseInspectExit = writeBaseInspectIfPossible({ group, command, context, wantsJson });
  if (baseInspectExit !== null) return baseInspectExit;

  if (group === "verify") {
    return await runVerifyCli({ argv, context, wantsJson });
  }

  validateNotifyFlags({ group, command, flags });

  if (group === "agent-resource") {
    const { runAgentResourceCli } = await import("./cli-agent-resource-command.ts");
    return await runAgentResourceCli({ positionals, flags, context, wantsJson, binName });
  }

  if (group === "test") {
    const { runTestCli } = await import("./cli-test-command.ts");
    return await runTestCli({ positionals, flags, context, wantsJson, binName });
  }

  if (group === "mac-care") {
    const { runMacCareCli } = await import("./cli-mac-care-command.ts");
    return await runMacCareCli({ argv, positionals, flags, context, wantsJson, binName });
  }

  if (group === "evolution") {
    const { runEvolutionCli } = await import("./cli-evolution-command.ts");
    return await runEvolutionCli({ positionals, flags, context, wantsJson, binName });
  }

  if (group === "commands") {
    const { runCommandsCli } = await import("./cli-commands-command.ts");
    return await runCommandsCli({
      positionals,
      flags,
      argv,
      context,
      wantsJson,
      binName,
      workspaceRoot: flags.workspace || context.cwd,
    });
  }

  const v1DataExit = await runV1DataRouteIfPossible({ group, positionals, flags, argv, context, wantsJson, binName });
  if (v1DataExit !== null) return v1DataExit;

  if (!hasGeneratedCliRoute(group) && !isGeneratedCollectionAlias(group)) {
    if (command) {
      const denseDataExit = await runDenseDataRouteIfPossible({ argv, positionals, flags, context, wantsJson, binName });
      if (denseDataExit !== null) return denseDataExit;
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
        routeGroup: "legacy",
      });
    }
    const phrase = positionals.length ? positionals.join(" ") : group;
    const commandIntent = await resolveCommandIntent(phrase);
    if (commandIntent.status === "covered" || await isLegacyCollectionRoot(group)) {
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
        routeGroup: "legacy",
      });
    }
    return await handleUnknownCliCommand({ group, positionals, context, wantsJson, usage, commandIntent });
  }

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
      context.stderr.write(`${formatCliErrorText(handled)}\n`);
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

function validateNotifyFlags(input: {
  group: string | undefined;
  command: string | undefined;
  flags: Record<string, string>;
}): void {
  if (input.group !== "notify" || input.command !== "send") return;
  for (const flag of ["audience-json", "context-json", "delivery-json", "receipt-policy-json"]) {
    validateNotifyJsonObjectFlag(input.flags[flag], flag);
  }
}

function validateNotifyJsonObjectFlag(value: string | undefined, flag: string): void {
  const trimmed = value?.trim();
  if (!trimmed) return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    throw new CliHandledError(
      "invalid_notify_json",
      `--${flag} must be valid JSON: ${error instanceof Error ? error.message : "parse error"}`,
      CLI_EXIT_USAGE,
      { details: { flag } },
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new CliHandledError(
      "invalid_notify_json_object",
      `--${flag} must be a JSON object.`,
      CLI_EXIT_USAGE,
      { details: { flag } },
    );
  }
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
    return writeRemovedJsonOrText({ group, command, wantsJson, context, canonicalCommand, message: `\`${binName} ${group} ${command}\` is not part of the public Claw CLI surface. ${detail}` });
  }
  if ((group === "business" || group === "social") && command && REMOVED_V1_CRUD_COMMANDS.has(command)) {
    return writeRemovedJsonOrText({ group, command, wantsJson, context, canonicalCommand, message: `\`${binName} ${group} ${command}\` is removed pre-v1 CRUD and is not part of the public Claw CLI surface. Use the ${group} portal help to pick a supported route.` });
  }
  if (group === "content" && command && REMOVED_V1_CRUD_COMMANDS.has(command)) {
    return writeRemovedJsonOrText({ group, command, wantsJson, context, canonicalCommand, message: `\`${binName} content ${command}\` is removed pre-v1 CRUD and is not part of the public Claw CLI surface. Use content brand, destination, campaign, entry, approval, or publish commands.` });
  }
  if (group === "content" && command && REMOVED_CONTENT_PORTAL_COMMANDS.has(command)) {
    return writeRemovedJsonOrText({ group, command, wantsJson, context, canonicalCommand, message: `\`${binName} content ${command}\` is removed pre-v1 portal shorthand and is not part of the public Claw CLI surface. Use content brand, destination, campaign, entry, approval, or publish commands.` });
  }
  return null;
}

function writeRemovedJsonOrText(input: {
  group: string | undefined;
  command: string | undefined;
  wantsJson: boolean;
  context: CliContext;
  canonicalCommand: string;
  message: string;
}): number {
  if (input.wantsJson) {
    writeCommandJsonError(input.context.stdout, input.canonicalCommand, new CliHandledError("removed_public_command", input.message, CLI_EXIT_USAGE), {
      invokedCommand: input.group ?? input.canonicalCommand,
      subcommand: input.command ?? null,
    });
  } else {
    input.context.stderr.write(`${input.message}\n`);
  }
  return CLI_EXIT_USAGE;
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

async function runV1DataRouteIfPossible(input: {
  group: string;
  positionals: string[];
  flags: Record<string, string>;
  argv: string[];
  context: CliContext;
  wantsJson: boolean;
  binName: string;
}): Promise<number | null> {
  if (!input.wantsJson || !isV1DataFastRoot(input.group)) return null;
  if (input.flags["time-url"]) return null;
  const { runV1DataCli } = await import("./v1-data.ts");
  return await runV1DataCli({
    argv: input.argv,
    positionals: input.positionals,
    flags: input.flags,
    stdout: input.context.stdout,
    stderr: input.context.stderr,
    wantsJson: input.wantsJson,
    binName: input.binName,
    cwd: input.context.cwd,
    homeDir: os.homedir(),
  });
}

function isV1DataFastRoot(group: string): boolean {
  return group === "calendar";
}

async function runDenseDataRouteIfPossible(input: {
  argv: string[];
  positionals: string[];
  flags: Record<string, string>;
  context: CliContext;
  wantsJson: boolean;
  binName: string;
}): Promise<number | null> {
  const modulePath = [".", "cli-dense-data-command.ts"].join("/");
  try {
    const { runProfessionalRecordsCli } = await import(modulePath) as typeof import("./cli-dense-data-command.ts");
    return await runProfessionalRecordsCli({
      argv: input.argv,
      positionals: input.positionals,
      flags: input.flags,
      context: {
        stdout: input.context.stdout,
        stderr: input.context.stderr,
      },
      wantsJson: input.wantsJson,
      binName: input.binName,
      workspaceRoot: input.flags.workspace || input.context.cwd,
    });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException & { code?: string }).code;
    if (code === "ERR_MODULE_NOT_FOUND" || code === "MODULE_NOT_FOUND") return null;
    throw error;
  }
}

async function handleUnknownCliCommand(input: {
  group: string;
  positionals: string[];
  context: CliContext;
  wantsJson: boolean;
  usage: string;
  commandIntent?: { status: string; execute: boolean; intent?: unknown };
}): Promise<number> {
  const phrase = input.positionals.length ? input.positionals.join(" ") : input.group;
  const related = relatedCliMatches(phrase, { limit: 5 });
  const commandIntent = input.commandIntent ?? await resolveCommandIntent(phrase);
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
    const core = await import(CORE_CATALOGS_MODULE) as CoreCatalogsRuntime;
    if (typeof core.resolveClawCliCommandIntent === "function") {
      return core.resolveClawCliCommandIntent({ phrase }) as { status: string; execute: boolean; intent?: unknown };
    }
  } catch {
    // Keep unknown-command handling usable even when optional built artifacts are absent.
  }
  return { status: "gap", execute: false };
}

async function isLegacyCollectionRoot(group: string): Promise<boolean> {
  try {
    const core = await import(CORE_CATALOGS_MODULE) as CoreCatalogsRuntime;
    if (typeof core.resolveBuiltinCollectionName === "function") {
      return Boolean(core.resolveBuiltinCollectionName(group));
    }
  } catch {
    // Keep true unknown-command handling usable when optional built artifacts are absent.
  }
  return false;
}
