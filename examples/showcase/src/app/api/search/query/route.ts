import os from "node:os";
import path from "node:path";

import { clawCliCommandRegistry, type ClawCliCommandRegistryEntry } from "@clawjs/core";
import {
  SearchStore,
  createBuiltinSearchSourceManifests,
  type SearchDocumentInput,
  type SearchProfileId,
  type SearchQueryOutput,
} from "@clawjs/search";
import { isE2EEnabled } from "@/lib/e2e";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const query = (params.get("q") ?? "").trim();
  if (!query) return Response.json(emptyOutput(), { headers: NO_STORE_HEADERS });

  const profile = readProfile(params.get("profile"));
  const limit = readLimit(params.get("limit"));
  const domains = readList(params.get("domains"));
  const sources = readList(params.get("sources"));
  const explain = params.get("explain") === "true";

  if (isE2EEnabled()) {
    return Response.json(createE2EOutput(query, profile), { headers: NO_STORE_HEADERS });
  }

  const store = openSearchStore();
  try {
    ensureCommandFastPath(store);
    const output = store.query({
      query,
      profile,
      limit,
      explain,
      ...(domains.length ? { domains } : {}),
      ...(sources.length ? { sources } : {}),
      surface: "showcase.root-search",
    });
    return Response.json(output, { headers: NO_STORE_HEADERS });
  } finally {
    store.close();
  }
}

function openSearchStore(): SearchStore {
  const store = new SearchStore(resolveSearchDbPath());
  for (const manifest of createBuiltinSearchSourceManifests()) {
    store.registerSource(manifest);
  }
  return store;
}

function ensureCommandFastPath(store: SearchStore): void {
  if (store.sourceState("commands") !== "enabled") return;
  for (const command of clawCliCommandRegistry.commands) {
    store.upsertDocument(commandSearchDocument(command));
  }
  store.setCursor({
    source: "commands",
    cursor: `registry:${clawCliCommandRegistry.version}:${clawCliCommandRegistry.commands.length}`,
    metadata: { version: clawCliCommandRegistry.version, surface: "showcase.root-search" },
  });
}

function commandSearchDocument(command: ClawCliCommandRegistryEntry): SearchDocumentInput {
  const canonicalName = command.target ?? command.name;
  const references = [...command.docs, ...command.adrs, ...command.tests, command.source.file];
  const aliases = command.aliases ?? [];
  return {
    id: `commands:${command.name}`,
    source: "commands",
    shard: "hot",
    domain: "commands",
    type: "command",
    title: command.name,
    subtitle: command.kind === "alias" ? `Alias for ${canonicalName}` : command.kind,
    snippet: command.summary,
    body: [
      command.name,
      canonicalName,
      command.kind,
      command.summary,
      command.usage ? `Usage: ${command.usage}` : "",
      aliases.length ? `Aliases: ${aliases.join(", ")}` : "",
      command.family ? `Family: ${command.family}` : "",
      command.support.reason,
      command.support.scenario,
      references.join("\n"),
    ].filter(Boolean).join("\n"),
    resourceId: command.name,
    path: command.source.file,
    metadata: {
      canonicalName,
      kind: command.kind,
      aliases,
      family: command.family ?? null,
      support: command.support,
      securityPolicy: command.securityPolicy,
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
    ],
    actions: [
      { id: "copy-reference", kind: "copy", label: "Copy command reference", requiresApproval: false },
      { id: "help", kind: "run", label: `Show ${command.name} help`, requiresApproval: true, risk: "system", grant: "search.commands.run" },
    ],
  };
}

function createE2EOutput(query: string, profile: SearchProfileId): SearchQueryOutput {
  return {
    query,
    profile,
    partial: false,
    omittedSources: [],
    elapsedMs: 1,
    results: [
      {
        id: "commands:search",
        source: "commands",
        shard: "hot",
        domain: "commands",
        type: "command",
        title: "search",
        subtitle: "canonical",
        snippet: "Framework-wide Search.",
        score: 100,
        actions: [{ id: "copy-reference", kind: "copy", label: "Copy command reference" }],
        permissions: { canOpen: true, canPreview: true, redacted: false },
      },
    ],
  };
}

function emptyOutput(): SearchQueryOutput {
  return {
    query: "",
    profile: "framework",
    partial: false,
    omittedSources: [],
    elapsedMs: 0,
    results: [],
  };
}

function resolveSearchDbPath(): string {
  if (process.env.CLAW_SEARCH_DB_PATH) return path.resolve(process.env.CLAW_SEARCH_DB_PATH);
  if (process.env.CLAW_DATA_DIR) return path.join(path.resolve(process.env.CLAW_DATA_DIR), "search.sqlite");
  if (process.env.CLAW_HOME) return path.join(path.resolve(process.env.CLAW_HOME), "data", "search.sqlite");
  return path.join(os.homedir(), ".claw", "data", "search.sqlite");
}

function readProfile(value: string | null): SearchProfileId {
  return value === "full" ? "full" : "framework";
}

function readLimit(value: string | null): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(50, parsed)) : 12;
}

function readList(value: string | null): string[] {
  return (value ?? "").split(",").map((entry) => entry.trim()).filter(Boolean);
}
