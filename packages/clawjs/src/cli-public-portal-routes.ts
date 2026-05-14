import { runDelegatedContentCli } from "./cli-delegated-domains.ts";
import { CLI_EXIT_OK, CLI_EXIT_USAGE } from "./cli-errors.ts";
import { writeCommandJsonOk } from "./cli-json.ts";
import { PUBLIC_PORTAL_HELP_ONLY, buildCommandHelp } from "./cli-surface.ts";

type CliContext = {
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
  cwd: string;
  binName?: string;
};

type RunCli = (argv: string[], context: CliContext) => Promise<number>;

const CONTENT_PORTALS = new Set(["posts", "campaigns", "publications"]);
const MEDIA_PORTAL_CHILDREN = new Set([
  "documents",
  "files",
  "images",
  "audio",
  "video",
  "slides",
  "generations",
  "templates",
  "styles",
  "references",
]);
const JSON_HELP_REQUIRED_COMMANDS = new Set([
  "audio",
  "code",
  "commitments",
  "context",
  "content",
  "database",
  "erp",
  "handoffs",
  "iot",
  "judgment",
  "knowledge",
  "learning",
  "library",
  "mcp",
  "notes",
  "notify",
  "outcomes",
  "plan",
  "profile",
  "references",
  "rules",
  "runtime",
  "search",
  "sessions",
  "skills",
  "slides",
  "soul",
  "styles",
  "templates",
]);
const JSON_HELP_CANONICAL = new Map([
  ["ref", "references"],
  ["style", "styles"],
  ["template", "templates"],
]);

export async function runPublicPortalShortcut(input: {
  group: string | undefined;
  command: string | undefined;
  subcommand: string | undefined;
  argv: string[];
  flags: Record<string, string>;
  context: CliContext;
  runCli: RunCli;
}): Promise<number | null> {
  const { group, command, subcommand, argv, flags, context, runCli } = input;
  if (group && CONTENT_PORTALS.has(group)) {
    return await runCli(["content", group, ...(command ? argv.slice(1) : ["list", ...argv.slice(1)])], context);
  }
  if (group === "content" && command && CONTENT_PORTALS.has(command)) {
    const contentGroup = command === "posts" ? "entry" : command === "campaigns" ? "campaign" : "publish";
    const contentCommand = command === "publications" ? (!subcommand || subcommand === "list" ? "runs" : subcommand) : (subcommand ?? "list");
    const passthrough = subcommand ? argv.slice(3) : argv.slice(2);
    return await runDelegatedContentCli(["content", contentGroup, contentCommand, ...passthrough], flags, context);
  }
  if (group === "media" && command && MEDIA_PORTAL_CHILDREN.has(command)) {
    return await runCli([command, ...argv.slice(2)], context);
  }
  return null;
}

export function writePublicPortalHelpOnly(input: {
  group: string | undefined;
  command: string | undefined;
  subcommand: string | undefined;
  wantsJson: boolean;
  context: CliContext;
  binName: string;
  usage: string;
}): number | null {
  const { group, command, subcommand, wantsJson, context, binName, usage } = input;
  if (!group || !PUBLIC_PORTAL_HELP_ONLY.has(group)) return null;
  const commandHelp = buildCommandHelp(binName, group);
  if (wantsJson) {
    writeCommandJsonOk(context.stdout, group, { command: group, help: commandHelp ?? usage }, { invokedCommand: group, subcommand: command ?? null, ...(subcommand ? { operation: subcommand } : {}) });
    return CLI_EXIT_OK;
  }
  context.stderr.write(`${commandHelp ?? usage}\n`);
  return CLI_EXIT_USAGE;
}

export function writeMissingSubcommandJsonHelp(input: {
  group: string | undefined;
  command: string | undefined;
  wantsJson: boolean;
  context: CliContext;
  binName: string;
  usage: string;
}): number | null {
  const { group, command, wantsJson, context, binName, usage } = input;
  const canonical = group ? JSON_HELP_CANONICAL.get(group) ?? group : undefined;
  if (!wantsJson || !group || command || !canonical || !JSON_HELP_REQUIRED_COMMANDS.has(canonical)) return null;
  writeCommandJsonOk(context.stdout, canonical, { command: canonical, help: buildCommandHelp(binName, canonical) ?? usage }, { invokedCommand: group, subcommand: null });
  return CLI_EXIT_OK;
}
