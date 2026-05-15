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
const broadSymbolPattern = /\b(Thing|Stuff|Helper|Helpers|Util|Utils|Common|Data|Info|Manager)\b/g;
const allowedBroadSymbolContexts = [
  "DatabaseManager",
  "IoTManager",
  "MarketplaceManager",
  "SecretsManager",
  "FileManager",
  "PackageManager",
  "WindowManager",
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
]);
const conventionalDataFiles = new Set([
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "tsconfig.base.json",
  "claw.project.json",
  "openclaw.plugin.json",
]);

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(rootDir, relativePath));
}

function toPosix(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function walk(directory, out = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if ([".git", ".build", ".claude", "build", "node_modules", "dist", "coverage", "test-results"].includes(entry.name)) continue;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(absolutePath, out);
    else if (entry.isFile()) out.push(toPosix(path.relative(rootDir, absolutePath)));
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
    relativePath.includes("/channels/") ||
    relativePath.includes("/fixtures/") ||
    relativePath.includes("telegram") ||
    relativePath.includes("slack") ||
    relativePath.includes("ollama") ||
    relativePath.includes("openai");
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
    if (!conventionalDataFiles.has(name) && !/\.(registry|manifest|fixture|schema|baseline|matrix)\.(json|ya?ml)$/.test(name)) {
      warnings.push({ path: relativePath, kind: "data-file-role", message: "Owned docs data files should carry a role suffix" });
    }
  }

  if (sourceExtensions.has(ext)) {
    const text = read(relativePath);
    if (!isExternalProviderPath(relativePath)) {
      for (const term of criticalForbidden) {
        if (text.includes(term)) {
          warnings.push({ path: relativePath, kind: "context-vocabulary", term });
          break;
        }
      }
    }
    let match;
    while ((match = broadSymbolPattern.exec(text)) !== null) {
      const start = Math.max(0, match.index - 32);
      const end = Math.min(text.length, match.index + match[0].length + 32);
      const context = text.slice(start, end);
      if (!allowedBroadSymbolContexts.some((allowed) => context.includes(allowed))) {
        warnings.push({ path: relativePath, kind: "broad-symbol", term: match[0] });
        break;
      }
    }
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
