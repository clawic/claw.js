#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const rootDir = path.resolve(new URL("..", import.meta.url).pathname);
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
for (const sourceId of optionalFullSources) {
  const source = cliFullSources.find((candidate) => candidate.id === sourceId);
  if (!source) continue;
  if (source[`${"pro"}${"file"}`] !== "full") failures.push(`claw search sources full source list: ${sourceId} must use full source tier`);
  if (source.defaultState !== "off") failures.push(`claw search sources full source list: ${sourceId} must default off`);
  if (source.state !== "disabled") failures.push(`claw search sources full source list: ${sourceId} must be disabled by default`);
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
  "search.sources.list",
  "search.status",
  "search.jobs.schedule",
  "search.saved.create",
  "search.monitors.evaluate",
  "search.actions.execute",
  "search.profiles.list",
  "search.cursors.list",
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
