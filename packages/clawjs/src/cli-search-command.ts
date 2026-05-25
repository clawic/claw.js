import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveClawGlobalDataStorageDir } from "@clawjs/core";
import { clawCliCommandRegistry, detectClawPublicRepositories, type ClawRepositoryRoot } from "@clawjs/core/catalogs";
import type { CliContext } from "./index.ts";
import { CLI_EXIT_DEGRADED, CLI_EXIT_OK, CLI_EXIT_USAGE, CliHandledError } from "./cli-errors.ts";
import { writeCommandJsonOk, writeJsonOk } from "./cli-json.ts";
import { parseCsvFlag, readBooleanFlag } from "./cli-flag-parsers.ts";
import { buildCommandHelp, searchCliDiscovery, type ClawCliSearchResult } from "./cli-surface.ts";
import { SEARCH_ADMIN_COMMANDS, WORKSPACE_SEARCH_DOMAINS, type CommandFallbackPolicy } from "./cli-search-command-constants.ts";

export function isSearchAdminCommand(command: string | undefined): boolean {
  return !!command && SEARCH_ADMIN_COMMANDS.has(command);
}

export async function runSearchQueryCli(input: {
  positionals: string[];
  flags: Record<string, string>;
  argv?: string[];
  context: CliContext;
  wantsJson: boolean;
  binName: string;
}): Promise<number> {
  const missingIndexExit = tryRunMissingIndexSearchQuery(input);
  if (missingIndexExit !== null) return missingIndexExit;
  const { runSearchQueryCli: runHeavySearchQueryCli } = await import("./cli-search-heavy-command.ts");
  return await runHeavySearchQueryCli(input);
}

export async function runSearchRebuildCli(input: {
  flags: Record<string, string>;
  argv: string[];
  context: CliContext;
  wantsJson: boolean;
}): Promise<number> {
  const { runSearchRebuildCli: runHeavySearchRebuildCli } = await import("./cli-search-heavy-command.ts");
  return await runHeavySearchRebuildCli(input);
}

export async function runSearchAdminCli(input: {
  positionals: string[];
  flags: Record<string, string>;
  argv: string[];
  context: CliContext;
  wantsJson: boolean;
  binName: string;
  usage: string;
}): Promise<number> {
  const { runSearchAdminCli: runHeavySearchAdminCli } = await import("./cli-search-heavy-command.ts");
  return await runHeavySearchAdminCli(input);
}

export async function runCliDiscoverySearch(input: {
  positionals: string[];
  flags: Record<string, string>;
  context: CliContext;
  wantsJson: boolean;
  binName: string;
  usage: string;
}): Promise<number> {
  const query = input.positionals.slice(1).join(" ") || input.flags.query;
  if (!query) {
    input.context.stdout.write(`${buildCommandHelp(input.binName, "search") ?? input.usage}\n`);
    return CLI_EXIT_OK;
  }
  const limit = parseDiscoverySearchLimit(input.flags.limit);
  const repositories = detectClawPublicRepositories(input.context.cwd, { includeFallback: true });
  const results = mergeSearchResults([
    ...searchCliDiscovery(query, { limit }),
    ...searchRegisteredRepositoryFiles(query, repositories),
  ], limit);
  if (input.wantsJson) {
    writeJsonOk(input.context.stdout, {
      query,
      scope: {
        repositories: repositories.map((repo) => ({
          repo: repo.repo,
          rootDir: repo.rootDir,
          detectedBy: repo.detectedBy,
        })),
      },
      results,
    }, {
      schemaVersion: 1,
      canonicalCommand: "search",
      mode: "deterministic-local-discovery",
    });
  } else {
    input.context.stdout.write(`${results.map((result) => `${result.type}\t${result.name}\t${result.canonicalName ?? ""}\t${result.summary}`).join("\n")}\n`);
  }
  return results.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
}

function parseDiscoverySearchLimit(raw: string | undefined): number {
  if (raw === undefined) return 20;
  if (!/^[1-9][0-9]*$/.test(raw)) {
    throw new CliHandledError("invalid_search_limit", `Expected --limit to be a positive decimal integer, got ${raw}.`, CLI_EXIT_USAGE, {
      location: "cli.search.limit",
      suggestion: "Pass a positive decimal integer such as --limit 20.",
      safeNextStep: "Rerun claw search with a positive decimal integer --limit value.",
    });
  }
  const limit = Number(raw);
  if (!Number.isSafeInteger(limit)) {
    throw new CliHandledError("invalid_search_limit", `Expected --limit to be a safe positive decimal integer, got ${raw}.`, CLI_EXIT_USAGE, {
      location: "cli.search.limit",
      suggestion: "Pass a positive decimal integer up to 1000 such as --limit 20.",
      safeNextStep: "Rerun claw search with a safe positive decimal integer --limit value.",
    });
  }
  return Math.min(1000, limit);
}

function tryRunMissingIndexSearchQuery(input: {
  positionals: string[];
  flags: Record<string, string>;
  argv?: string[];
  context: CliContext;
  wantsJson: boolean;
  binName: string;
}): number | null {
  const query = input.positionals.slice(2).join(" ") || input.flags.query;
  if (!query) return null;
  const domains = parseListFlagLight(input.flags.domains);
  if (domains?.some((domain) => WORKSPACE_SEARCH_DOMAINS.has(domain))) return null;
  const scheduleRefresh = readBooleanFlag(input.argv ?? [], input.flags, "schedule-refresh");
  const persistentQuery = readBooleanFlag(input.argv ?? [], input.flags, "persistent") || scheduleRefresh;
  const searchDbPath = resolveSearchDbPathLight(input.flags);
  if (persistentQuery || fs.existsSync(searchDbPath)) return null;

  const strategy = parseSearchStrategyFlagLight(input.flags.strategy) ?? "lexical";
  const data = {
    query,
    sourceSet: input.flags["source-set"] === "full" ? "full" : "framework",
    results: [],
    partial: false,
    omittedSources: [],
    stale: false,
    staleSources: [],
    elapsedMs: 0,
    strategy,
    embeddingModel: embeddingModelForMissingIndex(strategy, input.flags),
    agentBudget: parseSearchAgentBudgetLight(input.flags) ?? null,
    commandFallback: { policy: parseCommandFallbackPolicyLight(input.flags["command-fallback"] ?? input.flags["fallback-commands"]), applied: false, reason: "missing_index", added: 0 },
    storage: { canonical: "core.sqlite", index: "search.sqlite", indexRebuildable: true },
    indexState: "missing",
  };
  if (input.wantsJson) {
    writeCommandJsonOk(input.context.stdout, "search", data, { subcommand: "query" });
  } else {
    input.context.stdout.write("");
  }
  return CLI_EXIT_DEGRADED;
}

function parseListFlagLight(value: string | undefined): string[] | undefined {
  const entries = parseCsvFlag(value);
  return entries.length ? entries : undefined;
}

function parseSearchStrategyFlagLight(value: string | undefined): "lexical" | "semantic" | "hybrid" | undefined {
  return value === "semantic" || value === "hybrid" || value === "lexical" ? value : undefined;
}

function parseSearchAgentBudgetLight(flags: Record<string, string>): { maxResults?: number; maxResultsPerSource?: number; maxResultsPerDomain?: number } | undefined {
  const maxResults = parseOptionalBoundedIntegerLight(flags["agent-result-limit"] ?? flags["agent-results-limit"], 1, 1000);
  const maxResultsPerSource = parseOptionalBoundedIntegerLight(flags["agent-source-limit"] ?? flags["agent-results-per-source"], 1, 1000);
  const maxResultsPerDomain = parseOptionalBoundedIntegerLight(flags["agent-domain-limit"] ?? flags["agent-results-per-domain"], 1, 1000);
  if (maxResults === undefined && maxResultsPerSource === undefined && maxResultsPerDomain === undefined) return undefined;
  return {
    ...(maxResults === undefined ? {} : { maxResults }),
    ...(maxResultsPerSource === undefined ? {} : { maxResultsPerSource }),
    ...(maxResultsPerDomain === undefined ? {} : { maxResultsPerDomain }),
  };
}

function parseOptionalBoundedIntegerLight(value: string | undefined, min: number, max: number): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function parseCommandFallbackPolicyLight(value: string | undefined): CommandFallbackPolicy {
  const normalized = value?.trim().toLowerCase();
  if (!normalized || normalized === "off" || normalized === "none" || normalized === "never" || normalized === "false" || normalized === "0") return "off";
  if (normalized === "empty" || normalized === "empty-results" || normalized === "no-results" || normalized === "missing") return "empty";
  if (normalized === "always" || normalized === "on" || normalized === "true" || normalized === "1") return "always";
  return "off";
}

function embeddingModelForMissingIndex(strategy: "lexical" | "semantic" | "hybrid", flags: Record<string, string>): string | null {
  if (strategy === "lexical") return null;
  if (flags["embedding-model"] || flags.model || flags["local-embedding"] === "true") return flags["embedding-model"] ?? flags.model ?? "local-text-v1";
  return null;
}

function resolveSearchDbPathLight(flags: Record<string, string>): string {
  if (flags["search-db-path"]) return path.resolve(flags["search-db-path"]);
  if (process.env.CLAW_SEARCH_DB_PATH) return path.resolve(process.env.CLAW_SEARCH_DB_PATH);
  const env = flags["data-dir"] ? { ...process.env, CLAW_DATA_DIR: flags["data-dir"] } : process.env;
  return path.join(resolveClawGlobalDataStorageDir({
    homeDir: os.homedir(),
    ...(env.CLAW_DATA_DIR ? { dataDir: env.CLAW_DATA_DIR } : {}),
    ...(env.CLAW_HOME ? { clawHome: env.CLAW_HOME } : {}),
  }), "search.sqlite");
}

function searchRegisteredRepositoryFiles(query: string, repositories: ClawRepositoryRoot[]): ClawCliSearchResult[] {
  return repositories.flatMap((repository) => searchRegisteredRepositoryLocalFiles(query, repository));
}

function searchRegisteredRepositoryLocalFiles(query: string, repository: Pick<ClawRepositoryRoot, "repo" | "rootDir">): ClawCliSearchResult[] {
  const cwd = repository.rootDir;
  const paths = new Map<string, { type: ClawCliSearchResult["type"]; canonicalName: string }>();
  if (repository.repo === "clawjs") {
    for (const entry of clawCliCommandRegistry.commands) {
      for (const doc of entry.docs) paths.set(doc, { type: doc.includes("/adr/") ? "adr" : "doc", canonicalName: entry.target ?? entry.name });
      for (const adr of entry.adrs) paths.set(adr, { type: "adr", canonicalName: entry.target ?? entry.name });
      for (const test of entry.tests) paths.set(test, { type: "test", canonicalName: entry.target ?? entry.name });
      paths.set(entry.source.file, { type: "source", canonicalName: entry.target ?? entry.name });
    }
  }
  for (const entry of discoverabilitySearchFiles(cwd)) {
    paths.set(entry.path, { type: entry.type, canonicalName: entry.canonicalName });
  }

  const results: ClawCliSearchResult[] = [];
  for (const [relativePath, meta] of paths) {
    const absolutePath = path.resolve(cwd, relativePath);
    if (!isSafeSearchFile(cwd, absolutePath)) continue;
    let content = "";
    try {
      const stat = fs.statSync(absolutePath);
      if (!stat.isFile() || stat.size > 512 * 1024) continue;
      content = fs.readFileSync(absolutePath, "utf8");
    } catch {
      continue;
    }
    const match = scoreFileContent(query, `${meta.canonicalName}\n${relativePath}\n${content}`);
    if (!match) continue;
    results.push({
      type: meta.type,
      name: relativePath,
      canonicalName: meta.canonicalName,
      score: match.score,
      summary: match.summary,
      path: relativePath,
      repo: repository.repo,
    });
  }
  return results;
}

function mergeSearchResults(results: ClawCliSearchResult[], limit: number): ClawCliSearchResult[] {
  const seen = new Set<string>();
  const unique: ClawCliSearchResult[] = [];
  for (const result of results) {
    const key = `${result.type}:${result.repo ?? ""}:${result.path ?? result.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(result);
  }
  return unique
    .sort((left, right) => (right.score ?? 0) - (left.score ?? 0) || left.name.localeCompare(right.name))
    .slice(0, limit);
}

function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function discoverabilitySearchFiles(cwd: string): Array<{ path: string; type: ClawCliSearchResult["type"]; canonicalName: string }> {
  const registryPath = path.resolve(cwd, "docs/discoverability.registry.json");
  try {
    const registry = JSON.parse(fs.readFileSync(registryPath, "utf8")) as {
      artifacts?: Array<{
        id?: string;
        kind?: string;
        canonicalName?: string;
        canonicalSource?: string;
        searchQueries?: Array<{ expectPath?: string }>;
      }>;
    };
    const entries: Array<{ path: string; type: ClawCliSearchResult["type"]; canonicalName: string }> = [];
    for (const artifact of registry.artifacts ?? []) {
      const type: ClawCliSearchResult["type"] = artifact.kind === "adr" || artifact.canonicalSource?.includes("/adr/") ? "adr"
        : artifact.kind === "skill" || artifact.canonicalSource?.includes("/skills/") ? "doc"
          : "doc";
      const canonicalName = artifact.canonicalName ?? artifact.id ?? "discoverability";
      if (artifact.canonicalSource) entries.push({ path: artifact.canonicalSource, type, canonicalName });
      for (const query of artifact.searchQueries ?? []) {
        if (query.expectPath) entries.push({ path: query.expectPath, type, canonicalName });
      }
    }
    return entries;
  } catch {
    return [];
  }
}

function isSafeSearchFile(cwd: string, absolutePath: string): boolean {
  const relativePath = path.relative(cwd, absolutePath);
  return !!relativePath
    && !relativePath.startsWith("..")
    && !path.isAbsolute(relativePath)
    && !relativePath.split(path.sep).some((segment) => ["node_modules", "dist", ".git", ".tmp", "build", ".next"].includes(segment));
}

function scoreFileContent(query: string, content: string): { score: number; summary: string } | null {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return null;
  const lines = content.split(/\r?\n/);
  const terms = normalizedQuery.split(/\s+/).filter(Boolean);
  let best: { score: number; summary: string } | null = null;
  for (const line of lines) {
    const normalizedLine = line.toLowerCase();
    let score = 0;
    if (normalizedLine.includes(normalizedQuery)) score = 75;
    else {
      const hits = terms.filter((term) => normalizedLine.includes(term)).length;
      if (hits > 0) score = 20 + hits * 8;
    }
    if (score === 0) continue;
    const summary = line.trim().replace(/\s+/g, " ").slice(0, 180);
    if (!best || score > best.score) best = { score, summary };
  }
  return best;
}
