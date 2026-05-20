import fs from "node:fs";
import path from "node:path";

const rootDir = path.resolve(new URL("..", import.meta.url).pathname);

const checks = [];

function fail(message) {
  checks.push(message);
}

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function requireSnippet(relativePath, snippet) {
  const text = read(relativePath);
  if (!text.includes(snippet)) {
    fail(`${relativePath} is missing required snippet: ${snippet}`);
  }
}

function forbidSnippet(relativePath, snippet) {
  const text = read(relativePath);
  if (text.includes(snippet)) {
    fail(`${relativePath} contains forbidden stale snippet: ${snippet}`);
  }
}

const agentDocs = [
  "AGENTS.md",
  "CLAUDE.md",
  "docs/decision-map.md",
  "docs/governance/v1-surface-closure/decisions.json",
  "docs/governance/v1-surface-closure/acceptance.json",
  "docs/governance/v1-surface-closure/validation.json",
  "docs/governance/v1-surface-closure/completion.md",
  "docs/host-ownership.md",
  "docs/data-storage-boundary.md",
  "docs/canonical-data-catalog.md",
  "docs/naming-style-guide.md",
  "docs/agentic-naming-guide.md",
  "docs/vocabulary.md",
  "docs/vocabulary.registry.json",
  "docs/naming-shape-audit.md",
  "docs/adr/0001-claw-framework-host-boundary.md",
  "docs/adr/0001-naming-and-stability-surfaces.md",
  "docs/adr/0003-source-file-boundaries.md",
  "docs/adr/0013-agentic-naming-and-code-structure.md",
  "docs/adr/0005-canonical-data-catalog.md",
  "scripts/naming-shape-check.mjs",
  "scripts/v1-surface-closure-audit-check.mjs",
];

for (const relativePath of agentDocs) {
  forbidSnippet(relativePath, "~/Library/Application Support/Clawix/clawjs");
}

function listMarkdownFiles(relativeDir) {
  const absoluteDir = path.join(rootDir, relativeDir);
  const files = [];
  for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
    const relativePath = path.join(relativeDir, entry.name);
    const absolutePath = path.join(rootDir, relativePath);
    if (entry.isDirectory()) {
      files.push(...listMarkdownFiles(relativePath));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(relativePath);
    }
  }
  return files;
}

for (const relativePath of ["README.md", ...listMarkdownFiles("docs")]) {
  forbidSnippet(relativePath, "~/Library/Application Support/Clawix/clawjs");
}

for (const relativePath of [
  "docs/secrets.md",
  "docs/secrets-security.md",
  "docs/adr/0008-secrets-security-v1.md",
  "docs/agent-rules/secrets.md",
  "docs/api.md",
  "docs/data-storage-boundary.md",
]) {
  forbidSnippet(relativePath, "legacy local proxy");
  forbidSnippet(relativePath, "compatibility-only");
  forbidSnippet(relativePath, "legacy plugin interfaces");
  forbidSnippet(relativePath, "deprecated compatibility declarations");
  forbidSnippet(relativePath, "unsafe legacy compatibility");
  forbidSnippet(relativePath, "Legacy `resolvedFields`");
  forbidSnippet(relativePath, "Legacy `auth.encrypted`");
  forbidSnippet(relativePath, "legacy `auth.encrypted`");
  forbidSnippet(relativePath, "legacy connection auth");
  forbidSnippet(relativePath, "legacy connection `auth.encrypted`");
  forbidSnippet(relativePath, "legacy readers");
  forbidSnippet(relativePath, "legacy migration");
  forbidSnippet(relativePath, "sidecar compatibility");
  forbidSnippet(relativePath, "Sidecar compatibility");
  forbidSnippet(relativePath, "compatibility sidecar");
  forbidSnippet(relativePath, "compatibility reader");
  forbidSnippet(relativePath, "legacy file");
  forbidSnippet(relativePath, "workspace legacy folder");
}

if (fs.existsSync(path.join(rootDir, "docs/sessions-and-streaming.md"))) {
  fail("docs/sessions-and-streaming.md must not ship as a compatibility alias; use docs/sessions.md");
}

for (const [relativePath, snippets] of [
  ["docs/api.md", ["available for compatibility"]],
  ["docs/relay.md", ["available for compatibility", "Relay v2 also distinguishes"]],
  ["docs/sessions.md", ["compatibility and title-style flows"]],
]) {
  for (const snippet of snippets) forbidSnippet(relativePath, snippet);
}

requireSnippet("CLAUDE.md", "AGENTS.md");
requireSnippet("CLAUDE.md", "docs/agent-rules/index.md");
requireSnippet("CLAUDE.md", "docs/decision-map.md");
requireSnippet("AGENTS.md", "docs/decision-map.md");
requireSnippet("AGENTS.md", "docs/constitution-map.md");
requireSnippet("AGENTS.md", "docs/agent-rules/index.md");
requireSnippet("docs/agent-rules/index.md", "../constitution-map.md");
requireSnippet("docs/agent-rules/index.md", "../host-ownership.md");
requireSnippet("docs/agent-rules/index.md", "../data-storage-boundary.md");
requireSnippet("docs/agent-rules/index.md", "../canonical-data-catalog.md");
requireSnippet("docs/agent-rules/index.md", "../adr/0005-canonical-data-catalog.md");
requireSnippet("docs/agent-rules/index.md", "../adr/0003-source-file-boundaries.md");
requireSnippet("docs/agent-rules/index.md", "../agentic-naming-guide.md");
requireSnippet("docs/agent-rules/index.md", "../vocabulary.md");
requireSnippet("CONTRIBUTING.md", "docs/decision-map.md");
requireSnippet("RELEASING.md", "docs/decision-map.md");
requireSnippet("docs/AGENTS.md", "constitution-map.md");
requireSnippet("docs/AGENTS.md", "decision-map.md");
requireSnippet("docs/index.md", "Constitution Operational Map");
requireSnippet("docs/index.md", "Decision Map");
requireSnippet("docs/index.md", "Canonical Data Catalog");
requireSnippet("docs/repository-map.md", "Constitution Operational Map");
requireSnippet("docs/repository-map.md", "Decision Map");
requireSnippet("CONSTITUTION.md", "Capabilities are complete only when dual-surfaced");
requireSnippet("docs/constitution-map.md", "not a second source of truth");
requireSnippet("docs/constitution-map.md", "Affected surfaces");
requireSnippet("docs/adr/TEMPLATE.md", "## Surface Parity");
requireSnippet("docs/adr/0009-dual-human-programmatic-surfaces.md", "MCP is the model-native surface");
requireSnippet("docs/adr/0004-persistent-surface-registry-and-inspection.md", "surface parity metadata");

for (const snippet of [
  "decision -> document",
  "Constitution Operational Map",
  "ClawJS/Claw owns framework contracts",
  "New workspace-local framework writes use `.claw/`",
  "Sensitive native permissions",
  "source file boundaries",
  "Changesets are release metadata",
  "Built-in collections follow the canonical data catalog",
  "scripts/verify-host-permission-contract.mjs",
  "No known pending guardrails",
]) {
  requireSnippet("docs/decision-map.md", snippet);
}

for (const snippet of [
  "human-recognizable structured entities",
  "digitally validated workflows",
  "Fields are optional by default",
  "Every new relation field must declare what the relation means",
  "Custom databases",
]) {
  requireSnippet("docs/canonical-data-catalog.md", snippet);
}

for (const snippet of [
  "Status: Accepted",
  "ClawJS owns canonical catalog definitions",
  "Fields are optional by default",
  "Relations are semantic",
  "active debt, not",
  "zero undocumented built-ins",
]) {
  requireSnippet("docs/adr/0005-canonical-data-catalog.md", snippet);
}

for (const snippet of [
  "Canonical data aims for broad human coverage",
  "Canonical schemas are sparse by default",
  "Relationships are first-class data",
]) {
  requireSnippet("CONSTITUTION.md", snippet);
}

for (const snippet of [
  "Status: accepted",
  "`1200-2000` lines",
  "`>2000` lines",
  "CLI entrypoints only parse global flags",
  "scripts/source-size-check.mjs",
  "docs/source-size-baseline.json",
  "compressed enum/union/list patterns",
]) {
  requireSnippet("docs/adr/0003-source-file-boundaries.md", snippet);
}

for (const snippet of [
  "Status: accepted",
  "ClawJS is the canonical source for shared vocabulary",
  "docs/vocabulary.registry.json",
  "scripts/naming-shape-check.mjs",
  "`session` / `sessionId` is the canonical framework conversation identity",
]) {
  requireSnippet("docs/adr/0013-agentic-naming-and-code-structure.md", snippet);
}

for (const snippet of [
  "~/.claw",
  "~/.clawix",
  ".claw/",
  "ClawHostKit",
  "MacControlWire",
  "Claw.app",
  "`claw` is the single public CLI",
  "~/.codex",
]) {
  requireSnippet("docs/host-ownership.md", snippet);
}

for (const snippet of [
  "core.sqlite",
  "productivity.sqlite",
  "vault.sqlite",
  "runtime.sqlite",
  "search.sqlite",
  "Plaintext secrets never live",
]) {
  requireSnippet("docs/data-storage-boundary.md", snippet);
}

const ownership = read("docs/host-ownership.md");
if (!/\.clawjs[\s\S]{0,160}retired pre-public path/.test(ownership)) {
  fail("docs/host-ownership.md must label .clawjs as a retired pre-public path");
}

for (const snippet of [
  "| JSON/API/YAML framework fields | `camelCase` |",
  "| CLI commands and flags | `kebab-case` |",
  "| SQL tables/columns/indexes | `snake_case` |",
  "| Event names | `domain.action`, kebab segments |",
  "`sessionId` for framework conversation identity",
  "docs/agentic-naming-guide.md",
]) {
  requireSnippet("docs/naming-style-guide.md", snippet);
}

for (const snippet of [
  "TS/JS source",
  "JSON/YAML owned by ClawJS",
  "Types use domain + role",
  "Functions use verb + object",
]) {
  requireSnippet("docs/agentic-naming-guide.md", snippet);
}

for (const snippet of [
  "\"schemaVersion\": 1",
  "\"owner\": \"clawjs\"",
  "\"preferredTerm\": \"session\"",
  "\"preferredTerm\": \"threadId\"",
]) {
  requireSnippet("docs/vocabulary.registry.json", snippet);
}

for (const snippet of [
  "Status: refreshed report",
  "Critical naming failures: 0",
  "Cleanup families",
]) {
  requireSnippet("docs/naming-shape-audit.md", snippet);
}

for (const snippet of [
  "The framework/product name is `ClawJS`.",
  "The public framework CLI is `claw`.",
  "SQL identifiers, table names, collection names, and exported SQL-like",
  "JSON, API, TypeScript, Swift, Kotlin, and C# contract fields use `camelCase`.",
  "`schemaVersion` is the canonical version field",
  "`protocolVersion` is the version field",
  "Do not expose public abbreviations such as `/mp` or `/ws`.",
]) {
  requireSnippet("docs/adr/0001-naming-and-stability-surfaces.md", snippet);
}

if (fs.existsSync(path.join(rootDir, "scripts", "v1-surface-closure-audit-check.mjs"))) {
  const { spawnSync } = await import("node:child_process");
  const result = spawnSync(process.execPath, [path.join(rootDir, "scripts", "v1-surface-closure-audit-check.mjs")], {
    cwd: rootDir,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    fail("v1 surface closure audit check failed");
    for (const line of result.stderr.trim().split("\n").filter(Boolean)) fail(line);
  }
}

if (checks.length > 0) {
  console.error("docs alignment check failed:");
  for (const check of checks) {
    console.error(`- ${check}`);
  }
  process.exit(1);
}

console.log("docs alignment check passed");
