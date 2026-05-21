import { detectClawPublicRepositories, type ClawCliSearchResult, type ClawRepositoryRoot } from "@clawjs/core/catalogs";
import type { CliContext } from "./index.ts";
import { CLI_EXIT_DEGRADED, CLI_EXIT_OK } from "./cli-errors.ts";
import { writeJsonOk } from "./cli-json.ts";
import { buildCommandHelp, searchCliDiscovery } from "./cli-surface.ts";
import { SEARCH_ADMIN_COMMANDS } from "./cli-search-command-constants.ts";

export function isSearchAdminCommand(command: string | undefined): boolean {
  return !!command && SEARCH_ADMIN_COMMANDS.has(command);
}

export async function runSearchQueryCli(input: {
  positionals: string[];
  flags: Record<string, string>;
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
  const limit = input.flags.limit ? Number(input.flags.limit) : 10;
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

function searchRegisteredRepositoryFiles(query: string, repositories: ClawRepositoryRoot[]): ClawCliSearchResult[] {
  const normalized = normalizeSearchText(query);
  if (!normalized) return [];
  const results: ClawCliSearchResult[] = [];
  for (const repository of repositories) {
    for (const target of repository.searchTargets) {
      const haystack = normalizeSearchText([
        target.path,
        target.canonicalName,
        target.summary,
        target.tags?.join(" "),
      ].filter(Boolean).join(" "));
      if (!haystack.includes(normalized)) continue;
      results.push({
        type: target.type,
        name: target.path,
        canonicalName: target.canonicalName,
        summary: target.summary,
        path: target.path,
        repo: repository.repo,
      });
    }
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
