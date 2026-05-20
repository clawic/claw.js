import { clawCliCommandRegistry, type ClawCliCommandRegistryEntry } from "@clawjs/core";
import {
  SearchStore,
  type SearchDocumentInput,
  type SearchQueryInput,
  type SearchQueryOutput,
} from "@clawjs/search";
import type { CommandFallbackPolicy } from "./cli-search-command-constants.ts";

export function sourceCanIndex(store: SearchStore, source: string): boolean {
  return !["disabled", "paused", "excluded", "external_pending"].includes(store.sourceState(source) ?? "enabled");
}

export function parseCommandFallbackPolicy(value: string | undefined): CommandFallbackPolicy {
  const normalized = value?.trim().toLowerCase();
  if (!normalized || normalized === "off" || normalized === "none" || normalized === "never" || normalized === "false" || normalized === "0") return "off";
  if (normalized === "empty" || normalized === "empty-results" || normalized === "no-results" || normalized === "missing") return "empty";
  if (normalized === "always" || normalized === "on" || normalized === "true" || normalized === "1") return "always";
  return "off";
}

export function commandFallbackForSearchQuery(store: SearchStore, input: {
  query: string;
  flags: Record<string, string>;
  policy: CommandFallbackPolicy;
  limit: number;
  domains?: string[];
  sources?: string[];
  shards?: string[];
  filters?: Record<string, unknown>;
  strategy?: SearchQueryInput["strategy"];
  agentBudget?: SearchQueryInput["agentBudget"];
  embedding?: SearchQueryInput["embedding"];
  explain?: boolean;
  surface?: string;
  actor?: string;
  baseResults: SearchQueryOutput;
}): {
  output?: SearchQueryOutput;
  report: {
    policy: CommandFallbackPolicy;
    applied: boolean;
    reason: "disabled" | "already_in_scope" | "not_needed" | "source_disabled" | "no_budget" | "queried";
    added: number;
  };
} {
  if (input.policy === "off") {
    return { report: { policy: "off", applied: false, reason: "disabled", added: 0 } };
  }
  if (input.domains?.includes("commands") || input.sources?.includes("commands")) {
    return { report: { policy: input.policy, applied: false, reason: "already_in_scope", added: 0 } };
  }
  if (input.policy === "empty" && input.baseResults.results.length > 0) {
    return { report: { policy: input.policy, applied: false, reason: "not_needed", added: 0 } };
  }
  if (!sourceCanIndex(store, "commands")) {
    return { report: { policy: input.policy, applied: false, reason: "source_disabled", added: 0 } };
  }
  const fallbackLimit = boundedCommandFallbackLimit(input.flags["command-fallback-limit"] ?? input.flags["fallback-commands-limit"], 5, 1, 20);
  const remaining = input.policy === "empty" ? input.limit : Math.max(0, input.limit - input.baseResults.results.length);
  const limit = Math.min(fallbackLimit, remaining);
  if (limit <= 0) {
    return { report: { policy: input.policy, applied: false, reason: "no_budget", added: 0 } };
  }
  const commandOutput = store.query({
    query: input.query,
    sourceSet: input.flags["source-set"] === "full" ? "full" : "framework",
    domains: ["commands"],
    shards: input.shards,
    filters: input.filters,
    strategy: input.strategy,
    agentBudget: input.agentBudget,
    embedding: input.embedding,
    limit,
    explain: input.explain,
    surface: input.surface,
    actor: input.actor,
  });
  const existingIds = new Set(input.baseResults.results.map((result) => result.id));
  const addedResults = commandOutput.results.filter((result) => !existingIds.has(result.id)).slice(0, limit);
  if (!addedResults.length) {
    return { report: { policy: input.policy, applied: true, reason: "queried", added: 0 } };
  }
  return {
    output: {
      ...input.baseResults,
      results: [...input.baseResults.results, ...addedResults].slice(0, input.limit),
      partial: input.baseResults.partial || commandOutput.partial,
      omittedSources: [...input.baseResults.omittedSources, ...commandOutput.omittedSources],
      elapsedMs: input.baseResults.elapsedMs + commandOutput.elapsedMs,
    },
    report: { policy: input.policy, applied: true, reason: "queried", added: addedResults.length },
  };
}

export function ensureCommandSourceIndexed(store: SearchStore): number {
  let reindexed = 0;
  for (const command of clawCliCommandRegistry.commands) {
    store.upsertDocument(commandSearchDocument(command));
    reindexed += 1;
  }
  store.setCursor({
    source: "commands",
    cursor: `registry:${clawCliCommandRegistry.version}:${clawCliCommandRegistry.commands.length}`,
    metadata: { version: clawCliCommandRegistry.version },
  });
  return reindexed;
}

function commandSearchDocument(command: ClawCliCommandRegistryEntry): SearchDocumentInput {
  const canonicalName = command.target ?? command.name;
  const references = [...command.docs, ...command.adrs, ...command.tests, command.source.file];
  const aliases = command.aliases ?? [];
  const title = command.name;
  const subtitle = command.kind === "alias" ? `Alias for ${canonicalName}` : command.kind;
  const snippet = command.summary;
  const usage = command.usage ? `Usage: ${command.usage}` : "";
  const body = [
    command.name,
    canonicalName,
    command.kind,
    command.summary,
    usage,
    aliases.length ? `Aliases: ${aliases.join(", ")}` : "",
    command.family ? `Family: ${command.family}` : "",
    command.support.reason,
    command.support.scenario,
    references.join("\n"),
  ].filter(Boolean).join("\n");
  return {
    id: `commands:${command.name}`,
    source: "commands",
    domain: "commands",
    type: "command",
    title,
    subtitle,
    snippet,
    body,
    resourceId: command.name,
    path: command.source.file,
    metadata: {
      canonicalName,
      kind: command.kind,
      aliases,
      family: command.family ?? null,
      schemaVersion: command.schemaVersion,
      support: command.support,
      securityPolicy: command.securityPolicy,
      docs: command.docs,
      adrs: command.adrs,
      tests: command.tests,
    },
    rankingHints: {
      fastPath: 1,
      command: 1,
      advanced: command.advanced ? -0.1 : 0,
    },
    fragments: [
      ...command.docs.map((doc, index) => ({
        id: `commands:${command.name}:doc:${index}`,
        title: "Documentation",
        body: doc,
        sortOrder: index,
        metadata: { kind: "doc", path: doc },
      })),
      ...command.adrs.map((adr, index) => ({
        id: `commands:${command.name}:adr:${index}`,
        title: "ADR",
        body: adr,
        sortOrder: 100 + index,
        metadata: { kind: "adr", path: adr },
      })),
      ...command.tests.map((test, index) => ({
        id: `commands:${command.name}:test:${index}`,
        title: "Test",
        body: test,
        sortOrder: 200 + index,
        metadata: { kind: "test", path: test },
      })),
    ],
    actions: [
      { id: "help", kind: "run", label: `Show ${command.name} help`, requiresApproval: true, risk: "system", grant: "search.commands.run" },
      { id: "copy-reference", kind: "copy", label: "Copy command reference", requiresApproval: false },
    ],
  };
}

function boundedCommandFallbackLimit(value: string | undefined, fallback: number, min: number, max: number): number {
  const number = value ? Number(value) : fallback;
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(number)));
}
