#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

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

const requiredPublicFiles = [
  "docs/adr/0019-search-v1-1-architecture.md",
  "docs/search.md",
  "packages/clawjs-search/package.json",
  "packages/clawjs-search/src/index.ts",
  "packages/clawjs-search/src/store.ts",
  "packages/clawjs-search-mcp/package.json",
  "packages/clawjs-search-mcp/src/index.ts",
  "packages/clawjs/src/cli-search-command.ts",
  "packages/clawjs/src/cli-search-docs-pages-source.ts",
  "packages/clawjs/src/cli-search-index.test.ts",
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

function requirePackageScript(name, expected) {
  const packageJson = JSON.parse(read("package.json"));
  if (packageJson.scripts?.[name] !== expected) {
    failures.push(`package.json: script ${name} must be ${JSON.stringify(expected)}`);
  }
}

for (const file of requiredPublicFiles) read(file);

requirePackageScript("search:scale-lab", "node --import tsx ./scripts/search-scale-lab.ts");
requirePackageScript("test:search-goal", "node ./scripts/verify-search-v1-1-goal.mjs");

for (const source of requiredSources) {
  requireSnippet("packages/clawjs-search/src/index.ts", `id: "${source}"`);
  requireSnippet("docs/search.md", `\`${source}\``);
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
  "search keeps optional full sources out of scoped domain queries",
  "search rebuild indexes surface route graph contracts",
  "Search MCP package publishes only the public Search binary",
  "docs.pages event jobs refresh and tombstone individual docs",
]) {
  requireSnippet("packages/clawjs/src/cli-search-index.test.ts", snippet);
}

requireSnippet("packages/clawjs/src/cli-search-events.ts", "scheduleDocsPagesSearchEvent");
requireSnippet("packages/clawjs/src/cli-search-events.ts", "source: \"docs.pages\"");

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
