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
  "docs/host-ownership.md",
  "docs/data-storage-boundary.md",
  "docs/adr/0001-claw-framework-host-boundary.md",
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

requireSnippet("CLAUDE.md", "AGENTS.md");
requireSnippet("CLAUDE.md", "docs/host-ownership.md");
requireSnippet("CLAUDE.md", "docs/data-storage-boundary.md");
requireSnippet("CLAUDE.md", "docs/adr/0001-claw-framework-host-boundary.md");

for (const snippet of [
  "~/.claw",
  ".claw/",
  "ClawHostKit",
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
if (!/\.clawjs[\s\S]{0,120}legacy compatibility only/.test(ownership)) {
  fail("docs/host-ownership.md must label .clawjs as legacy compatibility only");
}

if (checks.length > 0) {
  console.error("docs alignment check failed:");
  for (const check of checks) {
    console.error(`- ${check}`);
  }
  process.exit(1);
}

console.log("docs alignment check passed");
