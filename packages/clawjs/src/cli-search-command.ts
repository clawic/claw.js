import fs from "node:fs";
import path from "node:path";
import { clawCliCommandRegistry, detectClawPublicRepositories, type ClawRepositoryRoot } from "@clawjs/core/catalogs";
import type { CliContext } from "./index.ts";
import { CLI_EXIT_DEGRADED, CLI_EXIT_OK, CLI_EXIT_USAGE, CliHandledError } from "./cli-errors.ts";
import { writeJsonOk } from "./cli-json.ts";
import { buildCommandHelp, searchCliDiscovery, type ClawCliSearchResult } from "./cli-surface.ts";
import { SEARCH_ADMIN_COMMANDS } from "./cli-search-command-constants.ts";

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
  const limit = Number(raw);
  if (!Number.isFinite(limit) || limit <= 0) {
    throw new CliHandledError("invalid_search_limit", `Expected --limit to be a positive number, got ${raw}.`, CLI_EXIT_USAGE, {
      location: "cli.search.limit",
      suggestion: "Pass a positive limit such as --limit 20.",
      safeNextStep: "Rerun claw search with a positive --limit value.",
    });
  }
  return Math.min(1000, Math.floor(limit));
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
