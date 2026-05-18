#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

const rootDir = path.resolve(new URL("..", import.meta.url).pathname);
const {
  SearchStore,
  createFrameworkSearchSourceManifest,
} = await import(pathToFileURL(path.join(rootDir, "packages/clawjs-search/dist/index.js")).href);
const failures = [];

const requiredSources = [
  "commands",
  "sessions.chats",
  "database.records",
  "work.items",
  "documents.blocks",
  "notes.pages",
  "knowledge.graph",
  "signals.observations",
  "calendar.events",
  "finance.records",
  "eln.records",
  "images.derived",
  "media.assets",
  "slides.decks",
  "sheets.workbooks",
  "generations.artifacts",
  "code.symbols",
  "docs.pages",
  "skills.registry",
  "providers.routing",
  "snippets.library",
  "agents.catalog",
  "marketplace.choices",
  "content.items",
  "business.records",
  "social.posts",
  "iot.config",
  "connectors.catalog",
  "mcp.servers",
  "apps.catalog",
  "design.resources",
  "runtime.events",
  "surfaces.routes",
  "local.files",
  "native.system",
  "web.ingested",
  "external.cache",
];

const optionalFullSources = ["local.files", "native.system", "web.ingested", "external.cache"];
const requiredFrameworkSources = requiredSources.filter((source) => !optionalFullSources.includes(source));
const requiredIndexJobSources = requiredSources.filter((source) => source !== "native.system");
const requiredEntrypoints = {
  "root-search": {
    label: "Root Search",
    scope: "root",
    route: "/search",
    command: "claw search query",
    queryScope: "framework",
    shortcutState: "external_pending",
    shortcutOwner: "signed_host",
  },
  "search-index": {
    label: "Search Index",
    scope: "admin",
    route: "/search-index",
    command: "claw search sources",
    queryScope: "technical_admin",
    shortcutState: "not_applicable",
    shortcutOwner: "framework",
  },
  "chat-search": {
    label: "Chat Search",
    scope: "chat",
    queryScope: "conversations_only",
    shortcutState: "ready",
    shortcutOwner: "host_ui",
    reservedChord: "Command-G",
  },
};

const requiredResourceHandlers = {
  "sessions.chats": "ensureSessionChatResourceIndexed",
  "database.records": "ensureDatabaseRecordResourceIndexed",
  "work.items": "ensureWorkItemResourceIndexed",
  "documents.blocks": "ensureDocumentBlocksResourceIndexed",
  "notes.pages": "ensureNotesPageResourceIndexed",
  "knowledge.graph": "ensureKnowledgeGraphResourceIndexed",
  "signals.observations": "ensureSignalsObservationsResourceIndexed",
  "calendar.events": "ensureCalendarEventResourceIndexed",
  "finance.records": "ensureFinanceRecordResourceIndexed",
  "eln.records": "ensureElnRecordResourceIndexed",
  "images.derived": "ensureImageDerivedResourceIndexed",
  "media.assets": "ensureMediaAssetResourceIndexed",
  "slides.decks": "ensureSlidesDeckResourceIndexed",
  "sheets.workbooks": "ensureSheetsWorkbookResourceIndexed",
  "generations.artifacts": "ensureGenerationArtifactResourceIndexed",
  "code.symbols": "ensureCodeSymbolResourceIndexed",
  "docs.pages": "ensureDocsPageResourceIndexed",
  "skills.registry": "ensureSkillsRegistryResourceIndexed",
  "providers.routing": "ensureProvidersRoutingResourceIndexed",
  "snippets.library": "ensureSnippetsLibraryResourceIndexed",
  "agents.catalog": "ensureAgentsCatalogResourceIndexed",
  "marketplace.choices": "ensureMarketplaceChoiceResourceIndexed",
  "content.items": "ensureContentItemResourceIndexed",
  "business.records": "ensureBusinessRecordResourceIndexed",
  "social.posts": "ensureSocialPostResourceIndexed",
  "iot.config": "ensureIotConfigResourceIndexed",
  "connectors.catalog": "ensureConnectorCatalogResourceIndexed",
  "mcp.servers": "ensureMcpServerResourceIndexed",
  "apps.catalog": "ensureAppCatalogResourceIndexed",
  "design.resources": "ensureDesignResourceIndexed",
  "runtime.events": "ensureRuntimeEventsResourceIndexed",
  "surfaces.routes": "ensureSurfaceRouteResourceIndexed",
  "local.files": "ensureLocalFileResourceIndexed",
  "web.ingested": "ensureWebIngestedResourceIndexed",
  "external.cache": "ensureExternalCacheResourceIndexed",
};

const requiredEventSchedulers = {
  "sessions.chats": "scheduleSessionChatSearchEvent",
  "database.records": "scheduleDatabaseRecordSearchEvent",
  "work.items": "scheduleWorkItemsSearchEvent",
  "documents.blocks": "scheduleDocumentBlocksSearchEvent",
  "notes.pages": "scheduleNotesPagesSearchEvent",
  "knowledge.graph": "scheduleKnowledgeGraphSearchEvent",
  "signals.observations": "scheduleSignalsObservationsSearchEvent",
  "calendar.events": "scheduleCalendarEventsSearchEvent",
  "finance.records": "scheduleFinanceRecordsSearchEvent",
  "eln.records": "scheduleElnRecordsSearchEvent",
  "images.derived": "scheduleImageDerivedSearchEvent",
  "media.assets": "scheduleMediaAssetSearchEvent",
  "slides.decks": "scheduleSlidesDeckSearchEvent",
  "sheets.workbooks": "scheduleSheetsWorkbookSearchEvent",
  "generations.artifacts": "scheduleGenerationArtifactSearchEvent",
  "code.symbols": "scheduleCodeSymbolsSearchEvent",
  "docs.pages": "scheduleDocsPagesSearchEvent",
  "skills.registry": "scheduleSkillsRegistrySearchEvent",
  "providers.routing": "scheduleProvidersRoutingSearchEvent",
  "snippets.library": "scheduleSnippetsLibrarySearchEvent",
  "agents.catalog": "scheduleAgentsCatalogSearchEvent",
  "marketplace.choices": "scheduleMarketplaceChoicesSearchEvent",
  "content.items": "scheduleContentItemsSearchEvent",
  "business.records": "scheduleBusinessRecordsSearchEvent",
  "social.posts": "scheduleSocialPostsSearchEvent",
  "iot.config": "scheduleIotConfigSearchEvent",
  "connectors.catalog": "scheduleConnectorCatalogSearchEvent",
  "mcp.servers": "scheduleMcpServersSearchEvent",
  "apps.catalog": "scheduleAppsCatalogSearchEvent",
  "design.resources": "scheduleDesignResourcesSearchEvent",
  "runtime.events": "scheduleRuntimeEventsSearchEvent",
  "surfaces.routes": "scheduleSurfaceRouteSearchEvent",
  "local.files": "scheduleLocalFileSearchEvent",
  "web.ingested": "scheduleWebIngestedSearchEvent",
  "external.cache": "scheduleExternalCacheSearchEvent",
};

const requiredPublicFiles = [
  "docs/adr/0019-search-v1-1-architecture.md",
  "docs/search.md",
  "packages/clawjs-search/package.json",
  "packages/clawjs-search/README.md",
  "packages/clawjs-search/src/index.ts",
  "packages/clawjs-search/src/store.ts",
  "packages/clawjs-search-mcp/package.json",
  "packages/clawjs-search-mcp/src/index.ts",
  "packages/clawjs/src/cli-search-command.ts",
  "packages/clawjs/src/cli-search-docs-pages-source.ts",
  "packages/clawjs/src/cli-search-index.test.ts",
  "packages/clawjs/src/index-installed.test.ts",
  "scripts/search-scale-lab.ts",
];

function read(relativePath) {
  const fullPath = path.join(rootDir, relativePath);
  if (!fs.existsSync(fullPath)) {
    failures.push(`missing required file ${relativePath}`);
    return "";
  }
  return fs.readFileSync(fullPath, "utf8");
}

function requireSnippet(relativePath, snippet) {
  const text = read(relativePath);
  if (!text.includes(snippet)) failures.push(`${relativePath}: missing ${JSON.stringify(snippet)}`);
}

function requireNoSnippet(relativePath, snippet) {
  const text = read(relativePath);
  if (text.includes(snippet)) failures.push(`${relativePath}: contains forbidden ${JSON.stringify(snippet)}`);
}

function readJson(relativePath) {
  try {
    return JSON.parse(read(relativePath));
  } catch (error) {
    failures.push(`${relativePath}: invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
    return {};
  }
}

function requirePackageScript(name, expected) {
  const packageJson = readJson("package.json");
  if (packageJson.scripts?.[name] !== expected) {
    failures.push(`package.json: script ${name} must be ${JSON.stringify(expected)}`);
  }
}

function requireSameMembers(label, actual, expected) {
  const actualCounts = countMembers(actual);
  const expectedCounts = countMembers(expected);
  const duplicateActual = [...actualCounts.entries()].filter(([, count]) => count > 1).map(([value]) => value);
  const missing = [...expectedCounts.keys()].filter((value) => !actualCounts.has(value)).sort();
  const extra = [...actualCounts.keys()].filter((value) => !expectedCounts.has(value)).sort();

  if (duplicateActual.length > 0) {
    failures.push(`${label}: duplicate member(s) ${duplicateActual.join(", ")}`);
  }
  if (missing.length > 0) {
    failures.push(`${label}: missing required member(s) ${missing.join(", ")}`);
  }
  if (extra.length > 0) {
    failures.push(`${label}: unexpected member(s) ${extra.join(", ")}`);
  }
}

function countMembers(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}

function extractBuiltinSearchSourceIds() {
  const text = read("packages/clawjs-search/src/index.ts");
  const match = text.match(/export function createBuiltinSearchSourceManifests\(\): SearchSourceManifest\[] \{\n\s*return \[([\s\S]*?)\n\s*\];\n\}/);
  if (!match) {
    failures.push("packages/clawjs-search/src/index.ts: cannot find createBuiltinSearchSourceManifests body");
    return [];
  }

  const body = match[1];
  const ids = [];
  const manifestPattern = /create(?:Framework|Full)SearchSourceManifest\(\{\s*id: "([^"]+)"/g;
  for (const manifestMatch of body.matchAll(manifestPattern)) ids.push(manifestMatch[1]);
  if (body.includes("createCommandSearchSourceManifest()")) ids.push("commands");
  return ids;
}

function readCliSearchSources(sourceTier) {
  const sourceTierKey = `${"pro"}${"file"}`;
  const fullSourceFlag = `--${sourceTierKey}`;
  try {
    const output = execFileSync(process.execPath, [
      "packages/clawjs/bin/claw.mjs",
      "search",
      "sources",
      fullSourceFlag,
      sourceTier,
      "--json",
    ], {
      cwd: rootDir,
      encoding: "utf8",
      env: {
        ...process.env,
        CLAW_DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-search-goal-")),
      },
      timeout: 10_000,
    });
    const parsed = JSON.parse(output);
    if (parsed?.ok !== true || !Array.isArray(parsed?.data?.sources)) {
      failures.push(`claw search sources ${fullSourceFlag} ${sourceTier} --json: unexpected response shape`);
      return [];
    }
    return parsed.data.sources;
  } catch (error) {
    failures.push(`claw search sources ${fullSourceFlag} ${sourceTier} --json failed: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

function readCliSearchEntrypoints() {
  try {
    const output = execFileSync(process.execPath, [
      "packages/clawjs/bin/claw.mjs",
      "search",
      "entrypoints",
      "--json",
    ], {
      cwd: rootDir,
      encoding: "utf8",
      env: {
        ...process.env,
        CLAW_DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-search-goal-")),
      },
      timeout: 10_000,
    });
    const parsed = JSON.parse(output);
    if (parsed?.ok !== true || !Array.isArray(parsed?.data?.entrypoints)) {
      failures.push("claw search entrypoints --json: unexpected response shape");
      return [];
    }
    if (parsed.data.rootSearchShortcutState !== "external_pending") {
      failures.push("claw search entrypoints --json: Root Search shortcut must remain external pending");
    }
    if (parsed.data.chatSearchIsolation !== true) {
      failures.push("claw search entrypoints --json: chat search isolation must remain true");
    }
    return parsed.data.entrypoints;
  } catch (error) {
    failures.push(`claw search entrypoints --json failed: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

function readCliSearchJson(args, label, dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-search-goal-")), options = {}) {
  const hasJson = args.includes("--json");
  let output;
  try {
    output = execFileSync(process.execPath, [
      "packages/clawjs/bin/claw.mjs",
      "search",
      ...args,
      ...(hasJson ? [] : ["--json"]),
    ], {
      cwd: rootDir,
      encoding: "utf8",
      env: {
        ...process.env,
        CLAW_DATA_DIR: dataRoot,
      },
      timeout: 15_000,
    });
  } catch (error) {
    const stdout = error && typeof error === "object" && "stdout" in error ? error.stdout : "";
    if (options.allowNonZero && stdout) {
      output = Buffer.isBuffer(stdout) ? stdout.toString("utf8") : String(stdout);
    } else {
      failures.push(`${label} failed: ${error instanceof Error ? error.message : String(error)}`);
      return {};
    }
  }

  try {
    const parsed = JSON.parse(output);
    if (parsed?.ok !== true || parsed?.meta?.canonicalCommand !== "search") {
      failures.push(`${label}: unexpected response shape`);
      return {};
    }
    return parsed;
  } catch (error) {
    failures.push(`${label}: invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
    return {};
  }
}

function readCliSearchErrorJson(args, label, dataRoot) {
  try {
    execFileSync(process.execPath, [
      "packages/clawjs/bin/claw.mjs",
      "search",
      ...args,
      ...(args.includes("--json") ? [] : ["--json"]),
    ], {
      cwd: rootDir,
      encoding: "utf8",
      env: {
        ...process.env,
        CLAW_DATA_DIR: dataRoot,
      },
      timeout: 15_000,
    });
    failures.push(`${label}: expected a non-zero external-pending error`);
    return {};
  } catch (error) {
    const stdout = error && typeof error === "object" && "stdout" in error ? error.stdout : "";
    if (!stdout) {
      failures.push(`${label}: missing JSON error output`);
      return {};
    }
    try {
      const parsed = JSON.parse(Buffer.isBuffer(stdout) ? stdout.toString("utf8") : String(stdout));
      if (parsed?.ok !== false || parsed?.meta?.canonicalCommand !== "search") {
        failures.push(`${label}: unexpected error response shape`);
        return {};
      }
      return parsed;
    } catch (parseError) {
      failures.push(`${label}: invalid JSON error: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
      return {};
    }
  }
}

function seedRestrictedSearchAction(dataRoot) {
  const store = new SearchStore(path.join(dataRoot, "search.sqlite"));
  try {
    store.registerSource(createFrameworkSearchSourceManifest({
      id: "documents.blocks",
      domain: "documents",
      name: "Documents",
      resultTypes: ["document"],
    }));
    store.upsertDocument({
      id: "documents.blocks:goal-restricted",
      source: "documents.blocks",
      domain: "documents",
      type: "document",
      title: "Restricted Search action",
      body: "Restricted Search action for actor and scope checks.",
      permissions: { allowedActors: ["agent:goal-smoke"], requiredScopes: ["project-goal"] },
      actions: [{ id: "open", kind: "open", label: "Open restricted Search action", grant: "search.documents.open", requiresApproval: false }],
    });
  } finally {
    store.close();
  }
}

function requireCliSearchAcceptanceSmoke() {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-search-smoke-"));
  const rebuild = readCliSearchJson(["rebuild", "--source", "commands"], "claw search rebuild --source commands --json", dataRoot);
  if (rebuild.meta?.subcommand !== "rebuild") failures.push("claw search rebuild --source commands --json: missing rebuild subcommand metadata");
  if (rebuild.data?.mode !== "scoped") failures.push("claw search rebuild --source commands --json: must be a scoped rebuild");
  if (JSON.stringify(rebuild.data?.selectedSources ?? []) !== JSON.stringify(["commands"])) {
    failures.push("claw search rebuild --source commands --json: must rebuild only commands");
  }
  if (rebuild.data?.storage?.index !== "search.sqlite" || rebuild.data?.storage?.indexRebuildable !== true) {
    failures.push("claw search rebuild --source commands --json: must report rebuildable search.sqlite storage");
  }
  if (typeof rebuild.data?.indexedBySource?.commands !== "number" || rebuild.data.indexedBySource.commands <= 0) {
    failures.push("claw search rebuild --source commands --json: must index command results");
  }

  const shards = readCliSearchJson(["shards"], "claw search shards --json", dataRoot);
  const commandShard = shards.data?.shards?.find((shard) => shard.source === "commands" && shard.shard === "default");
  if (shards.meta?.subcommand !== "shards" || shards.data?.state !== "ready") {
    failures.push("claw search shards --json: must report shard catalog metadata");
  }
  if (!commandShard || commandShard.domain !== "commands" || commandShard.state !== "active") {
    failures.push("claw search shards --json: must expose the active command default shard");
  }
  if (typeof commandShard?.documentCount !== "number" || commandShard.documentCount <= 0 || typeof commandShard?.fragmentCount !== "number" || commandShard.fragmentCount <= 0) {
    failures.push("claw search shards --json: must report command shard document and fragment counts");
  }

  const query = readCliSearchJson(["query", "system", "--limit", "3", "--explain", "true"], "claw search query system --json", dataRoot);
  if (query.meta?.subcommand !== "query") failures.push("claw search query system --json: missing query subcommand metadata");
  if (query.data?.profile !== "framework") failures.push("claw search query system --json: must use framework profile by default");
  if (!Array.isArray(query.data?.results) || !query.data.results.some((result) => result.source === "commands" && result.title === "system")) {
    failures.push("claw search query system --json: must return the commands system result");
  }
  if (query.data?.partial !== false) failures.push("claw search query system --json: command-only smoke must not be partial");

  const status = readCliSearchJson(["status"], "claw search status --json", dataRoot);
  if (status.meta?.subcommand !== "status") failures.push("claw search status --json: missing status subcommand metadata");
  if (status.data?.state !== "ready") failures.push("claw search status --json: must report ready state");
  if (status.data?.budgets?.hotMs !== 50 || status.data?.budgets?.globalFirstBatchMs !== 200 || status.data?.budgets?.sourceTimeoutMs !== 75) {
    failures.push("claw search status --json: must report accepted Search budgets");
  }
  if (!Array.isArray(status.data?.sources)) failures.push("claw search status --json: must report source statuses");
  else requireSameMembers("claw search status source list", status.data.sources.map((source) => source.source), requiredSources);

  const profiles = readCliSearchJson(["profiles"], "claw search profiles --json", dataRoot);
  if (profiles.meta?.subcommand !== "profiles") failures.push("claw search profiles --json: missing profiles subcommand metadata");
  const profileItems = profiles.data?.profiles ?? [];
  if (!Array.isArray(profileItems) || profileItems.find((profile) => profile.id === "framework")?.defaultEnabled !== true) {
    failures.push("claw search profiles --json: framework profile must be default-enabled");
  }
  if (!Array.isArray(profileItems) || profileItems.find((profile) => profile.id === "full")?.defaultEnabled !== false) {
    failures.push("claw search profiles --json: full profile must be opt-in");
  }

  const aliases = readCliSearchJson(["aliases"], "claw search aliases --json", dataRoot);
  const aliasItems = aliases.data?.aliases ?? [];
  if (aliases.meta?.subcommand !== "aliases" || aliases.data?.count !== aliasItems.length) {
    failures.push("claw search aliases --json: must expose alias metadata and count");
  }
  if (aliases.data?.rootSearchShortcutState !== "external_pending" || aliases.data?.chatSearchIsolation !== true) {
    failures.push("claw search aliases --json: must preserve Root Search shortcut and chat isolation contracts");
  }
  if (!Array.isArray(aliasItems) || !aliasItems.some((alias) => alias.alias === "db" && alias.canonicalName === "database" && alias.searchDomain === "commands")) {
    failures.push("claw search aliases --json: must expose database launcher alias as a command-domain Search alias");
  }
  if (!Array.isArray(aliasItems) || !aliasItems.some((alias) => alias.alias === "image" && alias.canonicalName === "images" && alias.searchDomain === "commands")) {
    failures.push("claw search aliases --json: must expose image launcher alias as a command-domain Search alias");
  }

  const embeddingsStatus = readCliSearchJson(["embeddings", "status"], "claw search embeddings status --json", dataRoot);
  if (embeddingsStatus.meta?.subcommand !== "embeddings" || !["empty", "ready"].includes(embeddingsStatus.data?.state)) {
    failures.push("claw search embeddings status --json: must expose local embedding status");
  }
  if (embeddingsStatus.data?.storage?.index !== "search.sqlite" || embeddingsStatus.data?.storage?.indexRebuildable !== true) {
    failures.push("claw search embeddings status --json: must report rebuildable search.sqlite vector storage");
  }
  const embeddingsCreate = readCliSearchJson(["embeddings", "create", "system capabilities"], "claw search embeddings create --json", dataRoot);
  if (embeddingsCreate.data?.state !== "ready" || embeddingsCreate.data?.model !== "local-text-v1" || embeddingsCreate.data?.dimensions !== 64) {
    failures.push("claw search embeddings create --json: must create a local-text-v1 embedding");
  }
  if (!Array.isArray(embeddingsCreate.data?.vector) || embeddingsCreate.data.vector.length !== 64) {
    failures.push("claw search embeddings create --json: must return a 64-dimensional local vector");
  }
  const providerEmbeddingCreate = readCliSearchErrorJson(["embeddings", "create", "system capabilities", "--model", "provider-text-v1"], "claw search embeddings create provider model --json", dataRoot);
  if (providerEmbeddingCreate.error?.code !== "SEARCH_EMBEDDING_PROVIDER_PENDING" || !String(providerEmbeddingCreate.error?.message ?? "").includes("EXTERNAL PENDING")) {
    failures.push("claw search embeddings create provider model --json: must mark provider-backed embedding generation external pending");
  }

  const saved = readCliSearchJson(["saved"], "claw search saved --json", dataRoot);
  if (saved.meta?.subcommand !== "saved" || saved.data?.action !== "list" || !Array.isArray(saved.data?.items)) {
    failures.push("claw search saved --json: must list saved searches");
  }
  const monitors = readCliSearchJson(["monitors"], "claw search monitors --json", dataRoot);
  if (monitors.meta?.subcommand !== "monitors" || monitors.data?.action !== "list" || !Array.isArray(monitors.data?.items)) {
    failures.push("claw search monitors --json: must list monitors");
  }

  const savedCreate = readCliSearchJson([
    "saved",
    "create",
    "goal-smoke-system",
    "--query",
    "system capabilities",
    "--name",
    "Goal smoke system",
    "--domains",
    "commands",
    "--sources",
    "commands",
    "--shards",
    "default",
    "--strategy",
    "hybrid",
    "--local-embedding",
    "true",
    "--filters",
    "type=command",
    "--actor",
    "agent:goal-smoke",
    "--surface",
    "cli",
    "--limit",
    "4",
    "--explain",
    "true",
  ], "claw search saved create --json", dataRoot);
  if (savedCreate.meta?.subcommand !== "saved" || savedCreate.data?.action !== "create") {
    failures.push("claw search saved create --json: must create a saved search");
  }
  const savedQuery = savedCreate.data?.item?.query ?? {};
  if (savedCreate.data?.item?.id !== "goal-smoke-system") failures.push("claw search saved create --json: must preserve saved search id");
  if (savedCreate.data?.item?.name !== "Goal smoke system") failures.push("claw search saved create --json: must preserve saved search name");
  if (savedQuery.query !== "system capabilities") failures.push("claw search saved create --json: must preserve query text");
  if (JSON.stringify(savedQuery.domains ?? []) !== JSON.stringify(["commands"])) failures.push("claw search saved create --json: must preserve domains");
  if (JSON.stringify(savedQuery.sources ?? []) !== JSON.stringify(["commands"])) failures.push("claw search saved create --json: must preserve sources");
  if (JSON.stringify(savedQuery.shards ?? []) !== JSON.stringify(["default"])) failures.push("claw search saved create --json: must preserve shards");
  if (savedQuery.strategy !== "hybrid") failures.push("claw search saved create --json: must preserve hybrid strategy");
  if (savedQuery.embedding?.model !== "local-text-v1" || !Array.isArray(savedQuery.embedding?.vector) || savedQuery.embedding.vector.length !== 64) {
    failures.push("claw search saved create --json: must persist local embedding controls");
  }
  if (JSON.stringify(savedQuery.filters ?? {}) !== JSON.stringify({ type: "command" })) failures.push("claw search saved create --json: must preserve filters");
  if (savedQuery.actor !== "agent:goal-smoke") failures.push("claw search saved create --json: must preserve actor");
  if (savedQuery.surface !== "cli") failures.push("claw search saved create --json: must preserve surface");
  if (savedQuery.limit !== 4) failures.push("claw search saved create --json: must preserve limit");
  if (savedQuery.explain !== true) failures.push("claw search saved create --json: must preserve explain mode");

  const monitorCreate = readCliSearchJson([
    "monitors",
    "create",
    "goal-smoke-monitor",
    "--saved-search",
    "goal-smoke-system",
    "--cadence",
    "hourly",
  ], "claw search monitors create --json", dataRoot);
  if (monitorCreate.meta?.subcommand !== "monitors" || monitorCreate.data?.action !== "create") {
    failures.push("claw search monitors create --json: must create a monitor");
  }
  if (monitorCreate.data?.item?.id !== "goal-smoke-monitor") failures.push("claw search monitors create --json: must preserve monitor id");
  if (monitorCreate.data?.item?.savedSearchId !== "goal-smoke-system") failures.push("claw search monitors create --json: must link saved search");
  if (monitorCreate.data?.item?.cadence !== "hourly") failures.push("claw search monitors create --json: must preserve cadence");

  const monitorRun = readCliSearchJson([
    "monitors",
    "run",
    "goal-smoke-monitor",
    "--limit",
    "3",
  ], "claw search monitors run --json", dataRoot);
  const monitorRunItem = monitorRun.data?.items?.[0];
  if (monitorRun.meta?.subcommand !== "monitors" || monitorRun.data?.action !== "run") {
    failures.push("claw search monitors run --json: must run monitors");
  }
  if (monitorRunItem?.monitorId !== "goal-smoke-monitor" || monitorRunItem?.savedSearchId !== "goal-smoke-system") {
    failures.push("claw search monitors run --json: must return monitor and saved search ids");
  }
  if (monitorRunItem?.state !== "ready" || monitorRunItem?.partial !== false) {
    failures.push("claw search monitors run --json: must return a ready non-partial result");
  }
  if (monitorRunItem?.query?.limit !== 3) failures.push("claw search monitors run --json: must apply runtime limit override");
  if (!Array.isArray(monitorRunItem?.results) || !monitorRunItem.results.some((result) => result.source === "commands")) {
    failures.push("claw search monitors run --json: must return command results");
  }

  const monitorDelete = readCliSearchJson(["monitors", "delete", "goal-smoke-monitor"], "claw search monitors delete --json", dataRoot);
  if (monitorDelete.data?.id !== "goal-smoke-monitor" || monitorDelete.data?.deleted !== true) {
    failures.push("claw search monitors delete --json: must delete monitor");
  }
  readCliSearchJson(["monitors", "create", "goal-smoke-monitor-cascade", "--saved-search", "goal-smoke-system"], "claw search monitors create cascade --json", dataRoot);
  const savedDelete = readCliSearchJson(["saved", "delete", "goal-smoke-system"], "claw search saved delete --json", dataRoot);
  if (savedDelete.data?.id !== "goal-smoke-system" || savedDelete.data?.deleted !== true) {
    failures.push("claw search saved delete --json: must delete saved search");
  }
  const monitorsAfterCascade = readCliSearchJson(["monitors"], "claw search monitors after cascade --json", dataRoot);
  if (monitorsAfterCascade.data?.items?.some((item) => item.id === "goal-smoke-monitor-cascade")) {
    failures.push("claw search saved delete --json: must cascade monitor deletion");
  }

  const actions = readCliSearchJson(["actions"], "claw search actions --json", dataRoot);
  if (actions.meta?.subcommand !== "actions" || actions.data?.brokered !== true || actions.data?.grantSystem !== "host grants/approvals") {
    failures.push("claw search actions --json: must expose brokered host grants/approvals actions");
  }
  if (!Array.isArray(actions.data?.actions) || !actions.data.actions.some((action) => action.id === "open")) {
    failures.push("claw search actions --json: must include the open action");
  }
  const actionPreview = readCliSearchJson([
    "actions",
    "execute",
    "commands:system",
    "help",
    "--dry-run",
  ], "claw search actions execute --dry-run --json", dataRoot);
  const previewPlan = actionPreview.data?.plan ?? {};
  if (actionPreview.meta?.subcommand !== "actions.execute") {
    failures.push("claw search actions execute --dry-run --json: must report actions.execute metadata");
  }
  if (previewPlan.status !== "planned" || previewPlan.dryRun !== true) {
    failures.push("claw search actions execute --dry-run --json: must return a planned dry-run action");
  }
  if (previewPlan.grant !== "search.commands.run" || previewPlan.risk !== "system" || previewPlan.requiresApproval !== true) {
    failures.push("claw search actions execute --dry-run --json: must require the command grant and host approval");
  }
  if (previewPlan.broker?.operation !== "search.action.execute" || previewPlan.broker?.sideEffects !== "none") {
    failures.push("claw search actions execute --dry-run --json: must be a no-side-effect broker preview");
  }

  const actionApproved = readCliSearchJson([
    "actions",
    "execute",
    "commands:system",
    "help",
    "--host-approval-id",
    "approval_search_help",
  ], "claw search actions execute --host-approval-id --json", dataRoot);
  const approvedPlan = actionApproved.data?.plan ?? {};
  if (approvedPlan.status !== "brokered" || approvedPlan.hostApprovalId !== "approval_search_help") {
    failures.push("claw search actions execute --host-approval-id --json: must return a brokered approved plan");
  }
  if (approvedPlan.broker?.sideEffects !== "host_brokered") {
    failures.push("claw search actions execute --host-approval-id --json: must report host-brokered side effects");
  }

  const actionAudit = readCliSearchJson(["audit", "--type", "action"], "claw search audit --type action --json", dataRoot);
  const actionAuditItems = actionAudit.data?.items ?? [];
  if (!Array.isArray(actionAuditItems) || !actionAuditItems.some((item) => item.type === "action" && item.resultId === "commands:system" && item.actionId === "help" && item.status === "brokered" && item.risk === "system" && item.grant === "search.commands.run" && item.metadata?.hostApprovalId === "approval_search_help")) {
    failures.push("claw search audit --type action --json: must record brokered approved action audit");
  }

  seedRestrictedSearchAction(dataRoot);
  const hiddenRestrictedActions = readCliSearchJson(["actions", "documents.blocks:goal-restricted"], "claw search actions restricted hidden --json", dataRoot);
  if (!Array.isArray(hiddenRestrictedActions.data?.actions) || hiddenRestrictedActions.data.actions.length !== 0) {
    failures.push("claw search actions restricted hidden --json: must hide actions without required actor/scope");
  }
  const wrongScopeRestrictedActions = readCliSearchJson([
    "actions",
    "documents.blocks:goal-restricted",
    "--actor",
    "agent:goal-smoke",
    "--filter",
    "scopeId=wrong-project",
  ], "claw search actions restricted wrong scope --json", dataRoot);
  if (!Array.isArray(wrongScopeRestrictedActions.data?.actions) || wrongScopeRestrictedActions.data.actions.length !== 0) {
    failures.push("claw search actions restricted wrong scope --json: must hide actions when scope does not satisfy ACL");
  }
  const visibleRestrictedActions = readCliSearchJson([
    "actions",
    "documents.blocks:goal-restricted",
    "--actor",
    "agent:goal-smoke",
    "--filter",
    "scopeId=project-goal",
  ], "claw search actions restricted visible --json", dataRoot);
  if (!Array.isArray(visibleRestrictedActions.data?.actions) || !visibleRestrictedActions.data.actions.some((action) => action.id === "open")) {
    failures.push("claw search actions restricted visible --json: must expose actions when actor/scope satisfy ACL");
  }
  const blockedRestrictedExecute = readCliSearchErrorJson([
    "actions",
    "execute",
    "documents.blocks:goal-restricted",
    "open",
    "--actor",
    "agent:goal-smoke",
    "--filter",
    "scopeId=wrong-project",
    "--dry-run",
  ], "claw search actions execute restricted wrong scope --json", dataRoot);
  if (blockedRestrictedExecute.error?.code !== "search_action_not_found") {
    failures.push("claw search actions execute restricted wrong scope --json: must treat unauthorized actions as not found");
  }
  const plannedRestrictedExecute = readCliSearchJson([
    "actions",
    "execute",
    "documents.blocks:goal-restricted",
    "open",
    "--actor",
    "agent:goal-smoke",
    "--filter",
    "scopeId=project-goal",
    "--dry-run",
  ], "claw search actions execute restricted allowed --json", dataRoot);
  if (plannedRestrictedExecute.data?.plan?.status !== "planned" || plannedRestrictedExecute.data?.plan?.actionId !== "open") {
    failures.push("claw search actions execute restricted allowed --json: must plan actions when actor/scope satisfy ACL");
  }

  const sensitiveQuery = readCliSearchJson([
    "query",
    "password qzx-private-token",
    "--actor",
    "agent:goal-smoke",
    "--surface",
    "cli",
    "--limit",
    "3",
  ], "claw search query sensitive --json", dataRoot);
  if (sensitiveQuery.meta?.subcommand !== "query" || sensitiveQuery.data?.query !== "password qzx-private-token") {
    failures.push("claw search query sensitive --json: must execute the sensitive query");
  }
  const sensitiveAudit = readCliSearchJson(["audit", "--type", "sensitive_query"], "claw search audit --type sensitive_query --json", dataRoot);
  const sensitiveAuditItems = sensitiveAudit.data?.items ?? [];
  if (!Array.isArray(sensitiveAuditItems) || !sensitiveAuditItems.some((item) => item.type === "sensitive_query" && item.query === "password qzx-private-token" && item.actor === "agent:goal-smoke" && item.surface === "cli" && item.reason === "sensitive_query_or_redacted_result" && item.metadata?.profile === "framework" && typeof item.metadata?.resultCount === "number")) {
    failures.push("claw search audit --type sensitive_query --json: must record sensitive query audit metadata");
  }

  const explain = readCliSearchJson(["explain", "system"], "claw search explain system --json", dataRoot);
  if (explain.meta?.subcommand !== "explain") failures.push("claw search explain system --json: missing explain subcommand metadata");
  for (const mode of ["exact", "prefix", "fuzzy", "fts"]) {
    if (!explain.data?.matching?.includes(mode)) failures.push(`claw search explain system --json: missing ${mode} matching mode`);
  }
  if (!explain.data?.ranking?.includes("central score") || !explain.data?.ranking?.includes("local frecency")) {
    failures.push("claw search explain system --json: must explain central ranking and local frecency");
  }

  const pausedSource = readCliSearchJson(["sources", "pause", "commands"], "claw search sources pause commands --json", dataRoot);
  if (pausedSource.data?.action !== "pause" || pausedSource.data?.source !== "commands" || pausedSource.data?.state !== "paused") {
    failures.push("claw search sources pause commands --json: must pause commands");
  }
  const pausedList = readCliSearchJson(["sources"], "claw search sources after pause --json", dataRoot);
  const pausedCommands = pausedList.data?.sources?.find((source) => source.id === "commands");
  if (pausedCommands?.state !== "paused") failures.push("claw search sources after pause --json: must persist paused state");
  const pausedQuery = readCliSearchJson(["query", "system", "--sources", "commands", "--limit", "3"], "claw search query paused source --json", dataRoot, { allowNonZero: true });
  if (!pausedQuery.data?.omittedSources?.some((source) => source.source === "commands" && source.reason === "disabled" && String(source.message ?? "").includes("paused"))) {
    failures.push("claw search query paused source --json: must omit paused commands source");
  }
  if (pausedQuery.data?.results?.some((result) => result.source === "commands")) {
    failures.push("claw search query paused source --json: must not return paused command results");
  }

  const excludedSource = readCliSearchJson(["sources", "exclude", "commands"], "claw search sources exclude commands --json", dataRoot);
  if (excludedSource.data?.action !== "exclude" || excludedSource.data?.source !== "commands" || excludedSource.data?.state !== "excluded") {
    failures.push("claw search sources exclude commands --json: must exclude commands");
  }
  const excludedList = readCliSearchJson(["sources"], "claw search sources after exclude --json", dataRoot);
  const excludedCommands = excludedList.data?.sources?.find((source) => source.id === "commands");
  if (excludedCommands?.state !== "excluded") failures.push("claw search sources after exclude --json: must persist excluded state");

  const resumedSource = readCliSearchJson(["sources", "resume", "commands"], "claw search sources resume commands --json", dataRoot);
  if (resumedSource.data?.action !== "resume" || resumedSource.data?.source !== "commands" || resumedSource.data?.state !== "enabled") {
    failures.push("claw search sources resume commands --json: must resume commands");
  }
  const resumedQuery = readCliSearchJson(["query", "system", "--sources", "commands", "--limit", "3"], "claw search query resumed source --json", dataRoot);
  if (!resumedQuery.data?.results?.some((result) => result.source === "commands" && result.title === "system")) {
    failures.push("claw search query resumed source --json: must return resumed command results");
  }

  const nativePending = readCliSearchJson(["sources", "enable", "native.system", "--profile", "full"], "claw search sources enable native.system --profile full --json", dataRoot);
  const nativeSource = nativePending.data?.sources?.find((source) => source.id === "native.system");
  if (nativePending.data?.action !== "enable" || nativePending.data?.source !== "native.system" || nativePending.data?.state !== "external_pending") {
    failures.push("claw search sources enable native.system --profile full --json: must keep native system activation external pending");
  }
  if (nativeSource?.state !== "external_pending" || nativeSource?.profile !== "full" || nativeSource?.defaultState !== "off" || nativeSource?.fastPath !== false) {
    failures.push("claw search sources enable native.system --profile full --json: must expose native.system as a full-profile pending source");
  }
  const nativeQuery = readCliSearchJson(["query", "native settings", "--profile", "full", "--sources", "native.system", "--limit", "3"], "claw search query native.system external pending --json", dataRoot, { allowNonZero: true });
  if (!nativeQuery.data?.omittedSources?.some((source) => source.source === "native.system" && source.reason === "disabled" && String(source.message ?? "").includes("external_pending"))) {
    failures.push("claw search query native.system external pending --json: must omit external-pending native.system results");
  }
  if (nativeQuery.data?.results?.some((result) => result.source === "native.system")) {
    failures.push("claw search query native.system external pending --json: must not return native.system results before host integration");
  }

  const scheduledJob = readCliSearchJson([
    "jobs",
    "schedule",
    "upsert",
    "--source",
    "commands",
    "--resource-id",
    "commands:system",
  ], "claw search jobs schedule upsert --source commands --resource-id commands:system --json", dataRoot);
  if (scheduledJob.meta?.subcommand !== "jobs" || scheduledJob.data?.action !== "schedule") {
    failures.push("claw search jobs schedule upsert --source commands --resource-id commands:system --json: must report jobs schedule metadata");
  }
  if (scheduledJob.data?.item?.source !== "commands" || scheduledJob.data?.item?.shard !== "hot" || scheduledJob.data?.item?.operation !== "upsert") {
    failures.push("claw search jobs schedule upsert --source commands --resource-id commands:system --json: must create a hot command upsert job");
  }
  if (scheduledJob.data?.item?.resourceId !== "commands:system" || scheduledJob.data?.item?.payload?.eventDriven !== true) {
    failures.push("claw search jobs schedule upsert --source commands --resource-id commands:system --json: must preserve event-driven resource identity");
  }

  const serviceStatus = readCliSearchJson(["service", "status"], "claw search service status --json", dataRoot);
  if (serviceStatus.meta?.subcommand !== "service" || serviceStatus.data?.action !== "status") {
    failures.push("claw search service status --json: must report service status metadata");
  }
  if (serviceStatus.data?.service?.state !== "stopped" || serviceStatus.data?.service?.mode !== "embedded") {
    failures.push("claw search service status --json: fresh isolated service must start stopped in embedded mode");
  }
  if (serviceStatus.data?.service?.budgets?.hotMs !== 50 || serviceStatus.data?.service?.budgets?.globalFirstBatchMs !== 200 || serviceStatus.data?.service?.budgets?.sourceTimeoutMs !== 75) {
    failures.push("claw search service status --json: must report accepted Search budgets");
  }
  if (!Array.isArray(serviceStatus.data?.sources) || !serviceStatus.data.sources.some((source) => source.source === "commands")) {
    failures.push("claw search service status --json: must expose command source status");
  }

  const serviceStart = readCliSearchJson(["service", "start"], "claw search service start --json", dataRoot);
  if (serviceStart.data?.action !== "start" || serviceStart.data?.service?.state !== "ready" || serviceStart.data?.service?.mode !== "embedded") {
    failures.push("claw search service start --json: must start the embedded service");
  }
  if (typeof serviceStart.data?.service?.startedAt !== "string") {
    failures.push("claw search service start --json: must record startedAt");
  }

  const serviceJob = readCliSearchJson([
    "jobs",
    "enqueue",
    "rebuild",
    "--source",
    "commands",
    "--id",
    "job:service:commands",
    "--priority",
    "90",
  ], "claw search jobs enqueue rebuild --source commands --json", dataRoot);
  if (serviceJob.meta?.subcommand !== "jobs" || serviceJob.data?.action !== "enqueue") {
    failures.push("claw search jobs enqueue rebuild --source commands --json: must report jobs enqueue metadata");
  }
  if (serviceJob.data?.item?.id !== "job:service:commands" || serviceJob.data?.item?.source !== "commands" || serviceJob.data?.item?.operation !== "rebuild") {
    failures.push("claw search jobs enqueue rebuild --source commands --json: must preserve queued rebuild job identity");
  }
  if (serviceJob.data?.item?.status !== "queued" || serviceJob.data?.item?.priority !== 90) {
    failures.push("claw search jobs enqueue rebuild --source commands --json: must queue the rebuild job with priority");
  }

  const serviceRun = readCliSearchJson(["service", "run-once", "--limit", "1"], "claw search service run-once --limit 1 --json", dataRoot);
  const serviceRunItem = serviceRun.data?.worker?.items?.[0];
  if (serviceRun.data?.action !== "run-once" || serviceRun.data?.service?.state !== "ready") {
    failures.push("claw search service run-once --limit 1 --json: must run the embedded worker");
  }
  if (serviceRun.data?.worker?.claimed !== 1 || serviceRun.data?.worker?.completed !== 1 || serviceRun.data?.worker?.failed !== 0) {
    failures.push("claw search service run-once --limit 1 --json: must claim and complete exactly one job");
  }
  if (serviceRun.data?.worker?.stoppedReason !== "job_limit" || serviceRun.data?.worker?.budgets?.maxJobs !== 1) {
    failures.push("claw search service run-once --limit 1 --json: must honor the job limit budget");
  }
  if (serviceRunItem?.id !== "job:service:commands" || serviceRunItem?.source !== "commands" || serviceRunItem?.operation !== "rebuild" || serviceRunItem?.status !== "done") {
    failures.push("claw search service run-once --limit 1 --json: must complete the queued command rebuild job");
  }
  if (typeof serviceRunItem?.indexed !== "number" || serviceRunItem.indexed <= 0) {
    failures.push("claw search service run-once --limit 1 --json: must report indexed command documents");
  }

  const serviceStop = readCliSearchJson(["service", "stop"], "claw search service stop --json", dataRoot);
  if (serviceStop.data?.action !== "stop" || serviceStop.data?.service?.state !== "stopped" || serviceStop.data?.service?.mode !== "embedded") {
    failures.push("claw search service stop --json: must stop the embedded service");
  }
  if (typeof serviceStop.data?.service?.stoppedAt !== "string") {
    failures.push("claw search service stop --json: must record stoppedAt");
  }

  const daemonStart = readCliSearchJson(["service", "start", "--mode", "daemon"], "claw search service start --mode daemon --json", dataRoot, { allowNonZero: true });
  if (daemonStart.data?.action !== "start" || daemonStart.data?.service?.state !== "external_pending" || daemonStart.data?.service?.mode !== "daemon") {
    failures.push("claw search service start --mode daemon --json: must report daemon service as external pending");
  }
  if (!String(daemonStart.data?.service?.reason ?? "").includes("host supervisor")) {
    failures.push("claw search service start --mode daemon --json: must explain the signed host supervisor dependency");
  }
}

for (const file of requiredPublicFiles) read(file);

requirePackageScript("search:scale-lab", "node --import tsx ./scripts/search-scale-lab.ts");
requirePackageScript("test:search-goal", "node ./scripts/verify-search-v1-1-goal.mjs");
const cliPackageJson = readJson("packages/clawjs/package.json");
if (cliPackageJson.dependencies?.["@clawjs/index"] !== undefined) {
  failures.push("packages/clawjs/package.json: must not depend on retired @clawjs/index package");
}
if (cliPackageJson.dependencies?.["@clawjs/search"] !== "0.1.2") {
  failures.push("packages/clawjs/package.json: must depend on @clawjs/search 0.1.2");
}
const searchMcpPackageJson = readJson("packages/clawjs-search-mcp/package.json");
if (searchMcpPackageJson.name !== "@clawjs/search-mcp") {
  failures.push("packages/clawjs-search-mcp/package.json: package name must remain @clawjs/search-mcp");
}
if (JSON.stringify(searchMcpPackageJson.bin ?? {}) !== JSON.stringify({ "claw-search-mcp": "bin/claw-search-mcp.mjs" })) {
  failures.push("packages/clawjs-search-mcp/package.json: bin surface must publish only claw-search-mcp");
}
if (searchMcpPackageJson.dependencies?.["@clawjs/index"] !== undefined) {
  failures.push("packages/clawjs-search-mcp/package.json: must not depend on retired @clawjs/index package");
}
if (searchMcpPackageJson.dependencies?.["@clawjs/search"] !== "0.1.2") {
  failures.push("packages/clawjs-search-mcp/package.json: must depend on @clawjs/search 0.1.2");
}
requireSameMembers("builtin search source manifests", extractBuiltinSearchSourceIds(), requiredSources);

const cliFullSources = readCliSearchSources("full");
const cliFrameworkSources = readCliSearchSources("framework");
requireSameMembers("claw search sources full source list", cliFullSources.map((source) => source.id), requiredSources);
requireSameMembers("claw search sources framework source list", cliFrameworkSources.map((source) => source.id), requiredFrameworkSources);
for (const sourceId of requiredFrameworkSources) {
  const source = cliFullSources.find((candidate) => candidate.id === sourceId);
  if (!source) continue;
  if (source[`${"pro"}${"file"}`] !== "framework") failures.push(`claw search sources full source list: ${sourceId} must use framework source tier`);
  if (source.defaultState !== "on") failures.push(`claw search sources full source list: ${sourceId} must default on`);
  if (source.state !== "enabled") failures.push(`claw search sources full source list: ${sourceId} must be enabled by default`);
  if (source.fastPath !== true) failures.push(`claw search sources full source list: ${sourceId} must expose a framework fast path`);
  if (typeof source.domain !== "string" || source.domain.length === 0) failures.push(`claw search sources full source list: ${sourceId} must expose a domain`);
  if (typeof source.name !== "string" || source.name.length === 0) failures.push(`claw search sources full source list: ${sourceId} must expose a display name`);
  if (!Array.isArray(source.resultTypes) || source.resultTypes.length === 0) failures.push(`claw search sources full source list: ${sourceId} must expose result types`);
}
for (const source of cliFrameworkSources) {
  if (source[`${"pro"}${"file"}`] !== "framework") failures.push(`claw search sources framework source list: ${source.id} must use framework source tier`);
  if (source.defaultState !== "on") failures.push(`claw search sources framework source list: ${source.id} must default on`);
  if (source.state !== "enabled") failures.push(`claw search sources framework source list: ${source.id} must be enabled by default`);
  if (source.fastPath !== true) failures.push(`claw search sources framework source list: ${source.id} must expose a fast path`);
  if (!Array.isArray(source.resultTypes) || source.resultTypes.length === 0) failures.push(`claw search sources framework source list: ${source.id} must expose result types`);
}
for (const sourceId of optionalFullSources) {
  const source = cliFullSources.find((candidate) => candidate.id === sourceId);
  if (!source) continue;
  if (source[`${"pro"}${"file"}`] !== "full") failures.push(`claw search sources full source list: ${sourceId} must use full source tier`);
  if (source.defaultState !== "off") failures.push(`claw search sources full source list: ${sourceId} must default off`);
  if (source.state !== "disabled") failures.push(`claw search sources full source list: ${sourceId} must be disabled by default`);
  if (source.fastPath !== false) failures.push(`claw search sources full source list: ${sourceId} must not expose a default fast path`);
  if (!Array.isArray(source.resultTypes) || source.resultTypes.length === 0) failures.push(`claw search sources full source list: ${sourceId} must expose result types`);
}
const cliEntrypoints = readCliSearchEntrypoints();
requireSameMembers("claw search entrypoints list", cliEntrypoints.map((entrypoint) => entrypoint.id), Object.keys(requiredEntrypoints));
for (const [entrypointId, expected] of Object.entries(requiredEntrypoints)) {
  const entrypoint = cliEntrypoints.find((candidate) => candidate.id === entrypointId);
  if (!entrypoint) continue;
  for (const [field, value] of Object.entries(expected)) {
    const actual = field === "shortcutState"
      ? entrypoint.shortcut?.state
      : field === "shortcutOwner"
        ? entrypoint.shortcut?.owner
        : field === "reservedChord"
          ? entrypoint.shortcut?.reservedChord
          : entrypoint[field];
    if (actual !== value) failures.push(`claw search entrypoints ${entrypointId}: ${field} must be ${JSON.stringify(value)}`);
  }
  if (entrypoint.preservesConversationSearchIsolation !== true) {
    failures.push(`claw search entrypoints ${entrypointId}: preservesConversationSearchIsolation must be true`);
  }
}
requireCliSearchAcceptanceSmoke();

for (const source of requiredSources) {
  requireSnippet("packages/clawjs-search/src/index.ts", `id: "${source}"`);
  requireSnippet("docs/search.md", `\`${source}\``);
}

for (const source of requiredIndexJobSources) {
  requireSnippet("packages/clawjs/src/cli-search-command.ts", `case "${source}":`);
}

for (const [source, handler] of Object.entries(requiredResourceHandlers)) {
  requireSnippet("packages/clawjs/src/cli-search-command.ts", `case "${source}":`);
  requireSnippet("packages/clawjs/src/cli-search-command.ts", handler);
}

for (const [source, scheduler] of Object.entries(requiredEventSchedulers)) {
  requireSnippet("packages/clawjs/src/cli-search-events.ts", scheduler);
  requireSnippet("packages/clawjs/src/cli-search-events.ts", `source: "${source}"`);
}
requireSnippet("packages/clawjs/src/cli-search-events.test.ts", "Search event schedulers create hot event-driven jobs for every framework source");
for (const source of Object.keys(requiredEventSchedulers)) {
  requireSnippet("packages/clawjs/src/cli-search-events.test.ts", `source: "${source}"`);
}

for (const snippet of [
  "Search Source Registry",
  "Root Search",
  "Search Index",
  "@clawjs/search",
  "claw search",
  "search.sqlite",
  "core.sqlite",
  "local.files",
  "native.system",
  "web.ingested",
  "external.cache",
  "EXTERNAL PENDING",
  "50 ms",
  "200 ms",
  "10000000",
]) {
  requireSnippet("docs/search.md", snippet);
}
requireSnippet("docs/adr/0019-search-v1-1-architecture.md", "The public product and CLI name is **Search**");
requireSnippet("docs/adr/0019-search-v1-1-architecture.md", "`Discovery` is not a public");
requireSnippet("packages/clawjs-search/README.md", "Search is the public capability");

for (const file of [
  "docs/search.md",
  "packages/clawjs-search/README.md",
  "packages/clawjs-search/package.json",
  "packages/clawjs-search-mcp/package.json",
]) {
  requireNoSnippet(file, "Discovery");
}

for (const snippet of [
  "root-search",
  "search-index",
  "chat-search",
  "preservesConversationSearchIsolation: true",
  "external_pending",
  "DEFAULT_SEARCH_BUDGETS",
  "globalFirstBatchMs: 200",
  "sourceTimeoutMs: 75",
  "createBuiltinSearchSourceManifests",
]) {
  requireSnippet("packages/clawjs-search/src/index.ts", snippet);
}

for (const snippet of [
  "search_ranking_cache",
  "search_cursors",
  "search_shards",
  "search_tombstones",
  "search_vectors",
  "search_index_jobs",
  "saved_searches",
  "search_monitors",
  "search_audit_events",
  "actionsForResult(resultId: string, access",
  "resultForId(resultId: string, access",
  "searchAclAllows(action.permissions_json",
]) {
  requireSnippet("packages/clawjs-search/src/store.ts", snippet);
}

for (const snippet of [
  "runSearchQueryCli",
  "runSearchRebuildCli",
  "runSearchAdminCli",
  "command === \"sources\"",
  "command === \"status\"",
  "command === \"service\"",
  "command === \"saved\"",
  "command === \"monitors\"",
  "command === \"actions\"",
  "searchActionAccessInput",
  "command === \"profiles\"",
  "command === \"explain\"",
]) {
  requireSnippet("packages/clawjs/src/cli-search-command.ts", snippet);
}

for (const snippet of [
  "\"claw-search-mcp\"",
  "\"@clawjs/search\"",
]) {
  requireSnippet("packages/clawjs-search-mcp/package.json", snippet);
}
requireNoSnippet("packages/clawjs-search-mcp/package.json", "clawjs-index-mcp");

for (const snippet of [
  "search.query",
  "search.embeddings.create",
  "model: localEmbeddingModel(p.model)",
  "search.sources.list",
  "search.sources.set_state",
  "search.status",
  "search.jobs.schedule",
  "search.saved.create",
  "search.monitors.evaluate",
  "search.actions.execute",
  "searchAccessFromParams",
  "search.profiles.list",
  "search.cursors.list",
  "value === \"external_pending\"",
]) {
  requireSnippet("packages/clawjs-search-mcp/src/index.ts", snippet);
}

for (const snippet of [
  "search rebuild indexes docs pages",
  "sessions.chats event jobs refresh and tombstone individual chats",
  "local.files event jobs refresh and tombstone individual files",
  "web.ingested event jobs refresh and tombstone individual cache files",
  "external.cache event jobs refresh and tombstone individual cache files",
  "search keeps optional full sources out of scoped domain queries",
  "search rebuild indexes surface route graph contracts",
  "Search MCP package publishes only the public Search binary",
  "docs.pages event jobs refresh and tombstone individual docs",
]) {
  requireSnippet("packages/clawjs/src/cli-search-index.test.ts", snippet);
}

for (const snippet of [
  "published CLI package does not depend on the retired Index package",
  "cliPackageJson.dependencies?.[\"@clawjs/index\"]",
  "cliPackageJson.dependencies?.[\"@clawjs/search\"]",
  "indexLauncher.includes('import(\"@clawjs/index\")')",
]) {
  requireSnippet("packages/clawjs/src/index-installed.test.ts", snippet);
}

requireSnippet("packages/clawjs/src/cli-search-events.ts", "scheduleDocsPagesSearchEvent");
requireSnippet("packages/clawjs/src/cli-search-events.ts", "source: \"docs.pages\"");
requireSnippet("packages/clawjs/src/cli-search-events.ts", "scheduleSessionChatSearchEvent");
requireSnippet("packages/clawjs/src/cli-search-events.ts", "source: \"sessions.chats\"");
requireSnippet("packages/clawjs/src/cli-search-command.ts", "ensureSessionChatResourceIndexed");
requireSnippet("packages/clawjs/src/cli-search-events.ts", "scheduleLocalFileSearchEvent");
requireSnippet("packages/clawjs/src/cli-search-events.ts", "source: \"local.files\"");
requireSnippet("packages/clawjs/src/cli-search-command.ts", "ensureLocalFileResourceIndexed");
requireSnippet("packages/clawjs/src/cli-search-events.ts", "scheduleWebIngestedSearchEvent");
requireSnippet("packages/clawjs/src/cli-search-events.ts", "source: \"web.ingested\"");
requireSnippet("packages/clawjs/src/cli-search-command.ts", "ensureWebIngestedResourceIndexed");
requireSnippet("packages/clawjs/src/cli-search-events.ts", "scheduleExternalCacheSearchEvent");
requireSnippet("packages/clawjs/src/cli-search-events.ts", "source: \"external.cache\"");
requireSnippet("packages/clawjs/src/cli-search-command.ts", "ensureExternalCacheResourceIndexed");
requireSnippet("packages/clawjs/src/cli-search-events.ts", "scheduleSurfaceRouteSearchEvent");
requireSnippet("packages/clawjs/src/cli-search-events.ts", "source: \"surfaces.routes\"");
requireSnippet("packages/clawjs/src/cli-search-surface-routes-test-utils.ts", "scheduleSurfaceRouteSearchEvent");
requireSnippet("packages/clawjs/src/cli-search-docs-pages-source.ts", "createLocalTextEmbedding");
requireSnippet("packages/clawjs/src/cli-search-docs-pages-source.ts", "LOCAL_TEXT_EMBEDDING_MODEL");

const publicScanRoots = ["docs", "packages", "examples"];
const forbiddenExternalReference = String.fromCharCode(82, 97, 121, 99, 97, 115, 116);
for (const root of publicScanRoots) scanForbidden(path.join(rootDir, root), forbiddenExternalReference);

function scanForbidden(fullPath, forbidden) {
  if (!fs.existsSync(fullPath)) return;
  const stat = fs.statSync(fullPath);
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(fullPath, { withFileTypes: true })) {
      if (["node_modules", "dist", ".next", ".turbo", ".cache"].includes(entry.name)) continue;
      scanForbidden(path.join(fullPath, entry.name), forbidden);
    }
    return;
  }
  if (!stat.isFile() || stat.size > 2 * 1024 * 1024) return;
  const text = fs.readFileSync(fullPath, "utf8");
  if (text.includes(forbidden) || text.includes(forbidden.toLowerCase())) {
    failures.push(`${path.relative(rootDir, fullPath)}: contains forbidden external product reference`);
  }
}

if (failures.length > 0) {
  console.error(`Search v1.1 goal guard failed with ${failures.length} issue(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Search v1.1 goal guard passed.");
