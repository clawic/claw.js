import {
  clawCliCommandRegistry,
  resolveClawCliCommand,
  searchClawCliRegistry,
  type ClawCliCommandRegistryEntry,
  type ClawCliSearchResult,
} from "@clawjs/core";

export const DEFAULT_CLI_BIN = "claw";

const PUBLIC_CLI_SURFACE = clawCliCommandRegistry.commands;

function surfaceRows(entries: ClawCliCommandRegistryEntry[]): string[] {
  return entries.map((entry) => {
    const target = entry.target ? ` -> ${entry.target}` : "";
    return `  ${entry.name.padEnd(14)} ${entry.kind.padEnd(9)} ${entry.summary}${target}`;
  });
}

export function buildCliUsage(binName = DEFAULT_CLI_BIN, options: { all?: boolean } = {}): string {
  const primary = PUBLIC_CLI_SURFACE.filter((entry) => !entry.advanced);
  const advanced = PUBLIC_CLI_SURFACE.filter((entry) => entry.advanced);
  return [
    `Usage: ${binName} <command> [options]`,
    "",
    "Primary commands and portals:",
    ...surfaceRows(primary),
    "",
    "Project scaffolding:",
    `  ${binName} new app|agent|server|workspace|skill|plugin <name> [--dir PATH] [--template NAME] [--package-manager npm|pnpm] [--git] [--install] [--yes]`,
    `  ${binName} generate skill|plugin|provider|channel|command <name> [--project PATH]`,
    `  ${binName} add provider|channel|telegram|scheduler|memory|workspace [name] [--project PATH]`,
    ...(options.all ? ["", "Advanced commands:", ...surfaceRows(advanced)] : ["", `Run \`${binName} --help --all\` for advanced commands.`]),
    "",
    "Global options:",
    "  --runtime demo|openclaw|codex|zeroclaw|picoclaw|nanobot|nanoclaw|nullclaw|ironclaw|nemoclaw|hermes",
    "  --workspace PATH",
    "  --json",
    "  --dry-run",
  ].join("\n");
}

export const CLI_USAGE = buildCliUsage();

const REMOVED_PUBLIC_COMMANDS = new Map<string, string>([
  ["data", "Use `claw database ...` for technical database operations or `claw work export|import|backup ...` for productivity snapshots."],
  ["app-state", "App state is internal. Use `claw host ...`, `claw doctor`, or diagnostics surfaces instead."],
  ["life", "Use real user-domain portals such as `health`, `travel`, `career`, `family`, `legal`, `finance`, `location`, or `accounts`."],
  ["memory", "Use `claw knowledge ...` or `claw knowledge memories ...`."],
  ["user", "Use `claw profile ...` or the profile domain portals such as `health`, `travel`, `career`, `family`, `legal`, `finance`, `location`, and `accounts`."],
  ["ops", "Use `claw logs`, `claw doctor`, `claw monitor`, or `claw host ...`."],
  ["infra", "`infra` is not a public Claw namespace. Use `claw host`, `claw monitor`, or `claw logs`."],
  ["workspace-search", "Use `claw search query ...`."],
  ["workspace-index", "Use `claw search rebuild`."],
  ["export", "Use `claw work export ...`."],
  ["import", "Use `claw work import ...`."],
  ["backup", "Use `claw work backup ...` or `claw database ...` for technical database backups."],
]);

export const REMOVED_RUNTIME_COMMANDS = new Set(["queue", "job", "event", "retention"]);
export const REMOVED_V1_CRUD_COMMANDS = new Set(["upsert", "list", "get", "delete"]);

const PLURAL_MEDIA_COMMAND_ALIASES = new Map(
  PUBLIC_CLI_SURFACE
    .filter((entry) => entry.family === "media" && entry.target)
    .map((entry) => [entry.name, entry.target!]),
);

const SINGULAR_MEDIA_COMMAND_ALIASES = new Map(
  PUBLIC_CLI_SURFACE.flatMap((entry) => (entry.aliases ?? []).map((alias) => [alias, entry.name] as const)),
);

export const PUBLIC_PORTAL_HELP_ONLY = new Set([
  "drive",
  "design",
  "apps",
  "business",
  "social",
  "monitor",
  "logs",
  "diagnostics",
  "health",
  "travel",
  "career",
  "family",
  "legal",
  "finance",
  "location",
  "accounts",
]);

function cliSurfaceEntry(name: string | undefined): ClawCliCommandRegistryEntry | undefined {
  return resolveClawCliCommand(name);
}

export function buildCommandHelp(binName: string, group: string): string | null {
  const entry = cliSurfaceEntry(group) ?? cliSurfaceEntry(SINGULAR_MEDIA_COMMAND_ALIASES.get(group));
  if (!entry) return null;
  return [
    `Usage: ${binName} ${entry.usage ?? `${group} [command] [options]`}`,
    "",
    `${entry.kind}: ${entry.summary}`,
    ...(entry.target ? [`Routes to: ${entry.target}`] : []),
    `Support: ${entry.support.state} - ${entry.support.reason}`,
    `Security: ${entry.securityPolicy}`,
    "",
    `Run \`${binName} --help --all\` to see the full public surface.`,
  ].join("\n");
}

export function removedPublicCommandMessage(group: string, binName: string): string | null {
  const message = REMOVED_PUBLIC_COMMANDS.get(group);
  if (!message) return null;
  return `\`${binName} ${group}\` is not part of the public Claw CLI surface. ${message}`;
}

function extractPositionals(argv: string[]): string[] {
  const positionals: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith("--")) {
      positionals.push(token);
      continue;
    }
    if (token.includes("=")) continue;
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      index += 1;
    }
  }
  return positionals;
}

export function normalizePublicCliArgv(argv: string[], stderr: NodeJS.WritableStream, binName: string): string[] {
  const positionals = extractPositionals(argv);
  const group = positionals[0];
  const pluralTarget = group ? PLURAL_MEDIA_COMMAND_ALIASES.get(group) : undefined;
  if (pluralTarget && (argv.includes("--help") || argv.includes("-h"))) {
    return argv;
  }
  if (group && pluralTarget) {
    let replaced = false;
    return argv.map((token) => {
      if (!replaced && token === group) {
        replaced = true;
        return pluralTarget;
      }
      return token;
    });
  }
  const canonical = group ? SINGULAR_MEDIA_COMMAND_ALIASES.get(group) : undefined;
  if (canonical && !argv.includes("--json")) {
    stderr.write(`Alias: \`${binName} ${group}\` maps to canonical \`${binName} ${canonical}\`.\n`);
  }
  return argv;
}

export function searchCliDiscovery(query: string, options: { limit?: number } = {}): ClawCliSearchResult[] {
  return searchClawCliRegistry(query, options);
}

export function relatedCliMatches(query: string, options: { limit?: number } = {}): Array<{
  type: ClawCliSearchResult["type"];
  name: string;
  canonicalCommand?: string;
  score: number;
  summary: string;
  path?: string;
}> {
  return searchCliDiscovery(query, options).map((result) => ({
    type: result.type,
    name: result.name,
    canonicalCommand: result.canonicalName,
    score: result.score,
    summary: result.summary,
    path: result.path,
  }));
}
