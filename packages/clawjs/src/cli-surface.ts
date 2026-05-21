import {
  GENERATED_CLI_COMMANDS,
  GENERATED_PUBLIC_PORTAL_HELP_ONLY,
  GENERATED_REMOVED_PUBLIC_COMMANDS,
  GENERATED_REMOVED_RUNTIME_COMMANDS,
  GENERATED_REMOVED_V1_CRUD_COMMANDS,
  type GeneratedCliCommandEntry,
} from "./cli-router.generated.ts";

export const DEFAULT_CLI_BIN = "claw";

export type ClawCliCommandRegistryEntry = GeneratedCliCommandEntry;

export interface ClawCliSearchResult {
  type: "command" | "alias" | "collection" | "doc" | "adr" | "test" | "source";
  name: string;
  canonicalName?: string;
  score: number;
  summary: string;
  command?: ClawCliCommandRegistryEntry;
  path?: string;
  repo?: string;
  source?: "command" | "collection";
  shadowedByCommand?: string;
}

const PUBLIC_CLI_SURFACE = [...GENERATED_CLI_COMMANDS];
const PUBLIC_CLI_SURFACE_BY_NAME = new Map(PUBLIC_CLI_SURFACE.map((entry) => [entry.name, entry]));

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

const REMOVED_PUBLIC_COMMANDS = new Map(Object.entries(GENERATED_REMOVED_PUBLIC_COMMANDS));

export const REMOVED_RUNTIME_COMMANDS = new Set<string>(GENERATED_REMOVED_RUNTIME_COMMANDS);
export const REMOVED_V1_CRUD_COMMANDS = new Set<string>(GENERATED_REMOVED_V1_CRUD_COMMANDS);

const PLURAL_MEDIA_COMMAND_ALIASES = new Map(
  PUBLIC_CLI_SURFACE
    .filter((entry) => entry.family === "media" && entry.target)
    .map((entry) => [entry.name, entry.target!]),
);

const SINGULAR_MEDIA_COMMAND_ALIASES = new Map(
  PUBLIC_CLI_SURFACE.flatMap((entry) => (entry.aliases ?? []).map((alias) => [alias, entry.name] as const)),
);

export const PUBLIC_PORTAL_HELP_ONLY = new Set<string>(GENERATED_PUBLIC_PORTAL_HELP_ONLY);

function cliSurfaceEntry(name: string | undefined): ClawCliCommandRegistryEntry | undefined {
  if (!name) return undefined;
  return PUBLIC_CLI_SURFACE_BY_NAME.get(name);
}

export function buildCommandHelp(binName: string, group: string): string | null {
  const entry = cliSurfaceEntry(group) ?? cliSurfaceEntry(SINGULAR_MEDIA_COMMAND_ALIASES.get(group));
  if (!entry) return null;
  return [
    `Usage: ${binName} ${entry.usage ?? `${group} [command] [options]`}`,
    "",
    `${entry.kind}: ${entry.summary}`,
    ...(entry.target ? [`Routes to: ${entry.target}`] : []),
    ...((entry.relatedSurfaces?.length ?? 0) > 0 ? ["", "Related surfaces:", ...entry.relatedSurfaces!.map((surface) => `  ${surface}`)] : []),
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
  const results: ClawCliSearchResult[] = [];
  for (const entry of PUBLIC_CLI_SURFACE) {
    const commandScore = Math.max(scoreText(query, entry.name), scoreText(query, entry.summary), scoreText(query, entry.family ?? ""));
    if (commandScore > 0) {
      results.push({ type: "command", name: entry.name, canonicalName: entry.target ?? entry.name, score: commandScore, summary: entry.summary, command: entry });
    }
    for (const alias of entry.aliases ?? []) {
      const aliasScore = scoreText(query, alias);
      if (aliasScore > 0) {
        results.push({ type: "alias", name: alias, canonicalName: entry.name, score: aliasScore + 5, summary: `Alias for ${entry.name}.`, command: entry });
      }
    }
    for (const doc of entry.docs) {
      const docScore = scoreText(query, doc);
      if (docScore > 0) results.push({ type: "doc", name: doc, canonicalName: entry.name, score: docScore, summary: `Documentation for ${entry.name}.`, command: entry, path: doc });
    }
    for (const adr of entry.adrs) {
      const adrScore = scoreText(query, adr);
      if (adrScore > 0) results.push({ type: "adr", name: adr, canonicalName: entry.name, score: adrScore, summary: `Decision source for ${entry.name}.`, command: entry, path: adr });
    }
    for (const test of entry.tests) {
      const testScore = scoreText(query, test);
      if (testScore > 0) results.push({ type: "test", name: test, canonicalName: entry.name, score: testScore, summary: `Validation for ${entry.name}.`, command: entry, path: test });
    }
    for (const relatedSurface of entry.relatedSurfaces ?? []) {
      const relatedScore = scoreText(query, relatedSurface);
      if (relatedScore > 0) results.push({ type: "alias", name: relatedSurface, canonicalName: entry.name, score: relatedScore + 6, summary: `Related surface for ${entry.name}.`, command: entry });
    }
    const sourceScore = scoreText(query, entry.source.file);
    if (sourceScore > 0) results.push({ type: "source", name: entry.source.file, canonicalName: entry.name, score: sourceScore, summary: `Implementation source for ${entry.name}.`, command: entry, path: entry.source.file });
  }
  return results
    .sort((a, b) => b.score - a.score || a.type.localeCompare(b.type) || a.name.localeCompare(b.name))
    .slice(0, options.limit ?? 10);
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

export function resolveGeneratedCliCommand(name: string | undefined): ClawCliCommandRegistryEntry | undefined {
  return cliSurfaceEntry(name);
}

function scoreText(query: string, text: string): number {
  const q = query.trim().toLowerCase();
  const value = text.toLowerCase();
  if (!q) return 0;
  if (value === q) return 100;
  if (value.startsWith(q)) return 80;
  if (value.includes(q)) return 50;
  const distance = editDistance(q, value);
  if (distance <= 1) return 45;
  if (distance <= 2 && Math.max(q.length, value.length) >= 5) return 35;
  const parts = q.split(/[\s._/-]+/).filter(Boolean);
  return parts.reduce((score, part) => score + (value.includes(part) ? 10 : 0), 0);
}

function editDistance(left: string, right: string): number {
  if (left === right) return 0;
  if (!left) return right.length;
  if (!right) return left.length;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = new Array<number>(right.length + 1);
  for (let i = 1; i <= left.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length] ?? Number.POSITIVE_INFINITY;
}
