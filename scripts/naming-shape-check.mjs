import fs from "node:fs";
import path from "node:path";

const rootDir = path.resolve(new URL("..", import.meta.url).pathname);
const json = process.argv.includes("--json");

const requiredDocs = [
  "docs/adr/0013-agentic-naming-and-code-structure.md",
  "docs/agentic-naming-guide.md",
  "docs/vocabulary.registry.json",
  "docs/vocabulary.md",
  "docs/naming-style-guide.md",
  "docs/adr/0003-source-file-boundaries.md",
  "scripts/source-size-check.mjs",
];

const sourceExtensions = new Set([".swift", ".ts", ".tsx", ".js", ".mjs", ".cs", ".kt"]);
const broadTerms = ["Thing", "Stuff", "Helper", "Helpers", "Util", "Utils", "Common", "Data", "Info", "Manager"];
const allowedBroadSymbolContexts = [
  "DataTable",
  "FormData",
  "MockData",
  "PackageManager",
  "FileManager",
  "DatabaseManager",
  "SecretsManager",
  "IoTManager",
  "MarketplaceManager",
  "TerminalManager",
  "BrowserSessionManager",
  "AgentData",
  "ClawData",
  "DataMaintenance",
  "DataWatch",
  "MainData",
  "V1Data",
  "WorkspaceData",
];
// Ecosystem terms where the broad word is part of the precise domain phrase.
const allowedBroadSymbolPhrases = [
  ["Database", "Manager"],
  ["IoT", "Manager"],
  ["Marketplace", "Manager"],
  ["Secrets", "Manager"],
  ["File", "Manager"],
  ["Package", "Manager"],
  ["Window", "Manager"],
  ["Data", "Url"],
  ["Data", "Uri"],
  ["Data", "Root"],
  ["Data", "Dir"],
  ["Data", "Directory"],
  ["Data", "Path"],
  ["Data", "Store"],
  ["Data", "Table"],
  ["Form", "Data"],
  ["Test", "Data"],
];
const rootConventionalMarkdown = new Set([
  "AGENTS.md",
  "CHANGELOG.md",
  "CLAUDE.md",
  "CODE_OF_CONDUCT.md",
  "CONTRIBUTING.md",
  "README.md",
  "RELEASING.md",
  "SECURITY.md",
  "TEMPLATE.md",
]);
const conventionalDataFiles = new Set([
  "codebase-manifest.json",
  "package.json",
  "package-lock.json",
  "source-size-baseline.json",
  "tsconfig.json",
  "tsconfig.base.json",
  "claw.project.json",
  "openclaw.plugin.json",
]);
const docsDataRoleSuffixes = new Set([
  "acceptance",
  "baseline",
  "config",
  "decisions",
  "fixture",
  "inventory",
  "manifest",
  "matrix",
  "pattern",
  "queue",
  "registry",
  "report",
  "schema",
  "tools",
  "validation",
  "verification",
]);
const ignoredDirectoryNames = new Set([
  ".git",
  ".build",
  ".claude",
  ".next",
  ".next-e2e",
  ".tmp",
  "artifacts",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "playwright-report",
  "test-results",
]);
const ignoredPathParts = [
  "/output/playwright/",
  "/Resources/web-dist/",
];

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(rootDir, relativePath));
}

function toPosix(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function shouldIgnorePath(relativePath, entryName) {
  if (ignoredDirectoryNames.has(entryName)) return true;
  const wrapped = `/${relativePath}/`;
  return ignoredPathParts.some((part) => wrapped.includes(part));
}

function walk(directory, out = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    const relativePath = toPosix(path.relative(rootDir, absolutePath));
    if (shouldIgnorePath(relativePath, entry.name)) continue;
    if (entry.isDirectory()) walk(absolutePath, out);
    else if (entry.isFile()) out.push(relativePath);
  }
  return out;
}

function loadCriticalVocabulary() {
  const registry = JSON.parse(read("docs/vocabulary.registry.json"));
  const criticalForbidden = [];
  for (const term of registry.terms ?? []) {
    for (const synonym of term.forbiddenSynonyms ?? []) {
      if (synonym.severity === "critical") criticalForbidden.push(synonym.term);
    }
  }
  return criticalForbidden;
}

function isExternalProviderPath(relativePath) {
  return relativePath.includes("/integrations/") ||
    relativePath.includes("clawjs-integrations/") ||
    relativePath.includes("/channels/") ||
    relativePath.includes("channel-") ||
    relativePath.includes("/fixtures/") ||
    relativePath.includes("/media/") ||
    relativePath.includes("/voice-notes/") ||
    relativePath.includes("/marketplace/") ||
    relativePath.includes("marketplace/") ||
    relativePath.includes("/audio/") ||
    relativePath.startsWith("audio/") ||
    relativePath.includes("clawjs-audio/") ||
    relativePath.startsWith("bridge/") ||
    relativePath.includes("/runtime/claw-app-server") ||
    relativePath.includes("/sessions/stream") ||
    relativePath.startsWith("apps/host/Sources/CommanderAdapters/") ||
    relativePath.startsWith("modules/user/src/") ||
    relativePath.startsWith("examples/mock/") ||
    relativePath.startsWith("examples/showcase/src/app/inbox/") ||
    relativePath.startsWith("examples/showcase/src/app/api/inbox/") ||
    relativePath.startsWith("examples/showcase/src/lib/demo-store") ||
    relativePath.startsWith("examples/showcase/src/lib/e2e") ||
    relativePath.startsWith("packages/clawjs-workspace/src/") ||
    relativePath === "packages/clawjs-core/src/types-workspace.ts" ||
    relativePath === "packages/clawjs-core/src/schemas-workspace.ts" ||
    relativePath === "packages/clawjs/src/cli-productivity-extended-command.ts" ||
    relativePath === "packages/clawjs/src/v1-data.ts" ||
    relativePath.startsWith("packages/clawjs-index/src/marketplace") ||
    relativePath === "packages/clawjs-index/src/app.ts" ||
    relativePath.startsWith("tests/e2e/sdk-") ||
    relativePath.startsWith("tests/e2e/demo-connectors") ||
    relativePath.includes("telegram") ||
    relativePath.includes("slack") ||
    relativePath.includes("ollama") ||
    relativePath.includes("openai");
}

function isAllowedContextVocabularyWindow(relativePath, term, windowText) {
  const lower = windowText.toLowerCase();
  if (term === "chatId") {
    return lower.includes("telegram") ||
      lower.includes("whatsapp") ||
      lower.includes("chat api") ||
      lower.includes("chat_id") ||
      lower.includes("chatref") ||
      lower.includes("chatname") ||
      lower.includes("use `sessionid`") ||
      lower.includes("external");
  }
  if (term === "threadId") {
    return lower.includes("codex") ||
      lower.includes("runtime") ||
      lower.includes("provider") ||
      lower.includes("targetid") ||
      lower.includes("telegram") ||
      lower.includes("discord") ||
      lower.includes("gmail") ||
      lower.includes("channel") ||
      lower.includes("media") ||
      lower.includes("marketplace") ||
      lower.includes("mailbox") ||
      lower.includes("voice") ||
      lower.includes("audio") ||
      lower.includes("inbox") ||
      lower.includes("inbox_thread") ||
      lower.includes("app_pinned_threads") ||
      lower.includes("app_session_titles") ||
      lower.includes("app_archives") ||
      lower.includes("app_sidebar_snapshots") ||
      lower.includes("email") ||
      lower.includes("message_thread") ||
      lower.includes("preferredterm") ||
      lower.includes("use `sessionid`") ||
      lower.includes("external");
  }
  return false;
}

function collectContextVocabularyWarnings(relativePath, text, criticalForbidden) {
  const warnings = [];
  const lines = text.split(/\n/u);
  const emitted = new Set();
  for (const term of criticalForbidden) {
    for (let index = 0; index < lines.length; index += 1) {
      if (!lines[index].includes(term)) continue;
      const start = Math.max(0, index - 8);
      const end = Math.min(lines.length, index + 9);
      const windowText = lines.slice(start, end).join("\n");
      if (isAllowedContextVocabularyWindow(relativePath, term, windowText)) continue;
      if (emitted.has(term)) continue;
      warnings.push({ path: relativePath, kind: "context-vocabulary", term });
      emitted.add(term);
    }
  }
  return warnings;
}

function splitIdentifier(identifier) {
  return identifier
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function hasAllowedBroadPhrase(tokens) {
  return allowedBroadSymbolPhrases.some((phrase) => {
    if (phrase.length > tokens.length) return false;
    return tokens.some((_, index) => {
      return phrase.every((term, offset) => tokens[index + offset] === term);
    });
  });
}

function findBroadTerm(identifier) {
  if (allowedBroadSymbolContexts.some((context) => identifier.includes(context))) return null;
  const tokens = splitIdentifier(identifier);
  if (hasAllowedBroadPhrase(tokens)) return null;
  return broadTerms.find((term) => tokens.includes(term)) ?? null;
}

function collectBroadSymbolWarnings(relativePath, text) {
  const warnings = [];
  const declarationPatterns = [
    /\b(?:class|struct|enum|protocol|interface|typealias|type|function|func)\s+([A-Za-z_][A-Za-z0-9_]*)/g,
    /\bexport\s+(?:const|let|var)\s+([A-Za-z_][A-Za-z0-9_]*)/g,
  ];
  const seen = new Set();
  for (const pattern of declarationPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const identifier = match[1];
      if (seen.has(identifier)) continue;
      seen.add(identifier);
      const term = findBroadTerm(identifier);
      if (term) warnings.push({ path: relativePath, kind: "broad-symbol", term, symbol: identifier });
    }
  }
  return warnings;
}

function hasDocsJsonRoleSuffix(name) {
  const stem = name.replace(/\.(json|ya?ml)$/u, "");
  const role = stem.split(/[.-]/u).at(-1);
  return docsDataRoleSuffixes.has(role);
}

const failures = [];
const warnings = [];

for (const relativePath of requiredDocs) {
  if (!exists(relativePath)) failures.push(`missing naming source ${relativePath}`);
}

const criticalForbidden = exists("docs/vocabulary.registry.json") ? loadCriticalVocabulary() : [];

for (const relativePath of walk(rootDir)) {
  const ext = path.extname(relativePath);
  const name = path.basename(relativePath);

  if (relativePath.startsWith("docs/") && ext === ".md") {
    if (!rootConventionalMarkdown.has(name) && /[A-Z_]/.test(name)) {
      warnings.push({ path: relativePath, kind: "markdown-name", message: "Markdown docs should use kebab-case unless conventional" });
    }
  }

  if ((ext === ".json" || ext === ".yaml" || ext === ".yml") && relativePath.startsWith("docs/")) {
    if (!conventionalDataFiles.has(name) && !hasDocsJsonRoleSuffix(name)) {
      warnings.push({ path: relativePath, kind: "data-file-role", message: "Owned docs data files should carry a role suffix" });
    }
  }

  if (sourceExtensions.has(ext)) {
    const text = read(relativePath);
    if (!isExternalProviderPath(relativePath)) {
      warnings.push(...collectContextVocabularyWarnings(relativePath, text, criticalForbidden));
    }
    warnings.push(...collectBroadSymbolWarnings(relativePath, text));
  }
}

const result = { failures, warnings };
if (json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  if (failures.length) {
    console.error("naming shape check failed:");
    for (const failure of failures) console.error(`- ${failure}`);
  }
  console.log(`naming shape check ${failures.length ? "failed" : "passed"} (${warnings.length} warnings)`);
}

if (failures.length) process.exit(1);
