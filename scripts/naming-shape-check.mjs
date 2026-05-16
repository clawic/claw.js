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
    relativePath.includes("/channels/") ||
    relativePath.includes("/fixtures/") ||
    relativePath.includes("telegram") ||
    relativePath.includes("slack") ||
    relativePath.includes("ollama") ||
    relativePath.includes("openai");
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
