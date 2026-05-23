#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createDiagnostic, printActionableFailureReport } from "./actionable-error.mjs";

const defaultRootDir = path.resolve(new URL("..", import.meta.url).pathname);
const baselinePath = "docs/hot-path-baseline.json";

function hotPathDiagnostic(failure) {
  if (failure.startsWith("unknown argument")) {
    return createDiagnostic("hot_path_usage_error", failure, {
      status: "USAGE",
      location: "scripts/hot-path-guard.mjs",
      suggestion: "Use --self-test or --root <repo>.",
      safeNextStep: "Rerun node scripts/hot-path-guard.mjs with a supported flag.",
    });
  }
  const finding = failure.match(/^(.+):(\d+) ([^ ]+) needs/);
  if (finding) {
    return createDiagnostic("hot_path_unbounded_operation", failure, {
      location: `${finding[1]}:${finding[2]}`,
      suggestion: "Add an inline hot-path-ok marker with maxBytes/maxItems/maxPixels and a reason, or add a reviewed baseline entry.",
      safeNextStep: `Fix ${finding[1]} or update docs/hot-path-baseline.json, then rerun node scripts/hot-path-guard.mjs.`,
    });
  }
  if (failure.startsWith(`missing ${baselinePath}`)) {
    return createDiagnostic("hot_path_baseline_missing", failure, {
      location: baselinePath,
      suggestion: "Restore the hot-path baseline before accepting historical hot-path exceptions.",
      safeNextStep: "Add docs/hot-path-baseline.json, then rerun node scripts/hot-path-guard.mjs.",
    });
  }
  if (failure.includes(baselinePath) || failure.includes("expired") || failure.includes("duplicates hot-path baseline key")) {
    return createDiagnostic("hot_path_baseline_invalid", failure, {
      location: baselinePath,
      suggestion: "Fix baseline schema, owner, limit, expiry, duplicate key, or stale linePattern.",
      safeNextStep: "Repair docs/hot-path-baseline.json, then rerun node scripts/hot-path-guard.mjs.",
    });
  }
  const missingSnippet = failure.match(/^(missing .+|.+ must include .+)$/);
  if (missingSnippet) {
    const location = failure.startsWith("missing ") ? failure.replace(/^missing /, "") : failure.split(" must include ")[0];
    return createDiagnostic("hot_path_policy_missing", failure, {
      location,
      suggestion: "Restore the hot-path governance hook before trusting the scan.",
      safeNextStep: `Update ${location}, then rerun node scripts/hot-path-guard.mjs.`,
    });
  }
  return createDiagnostic("hot_path_guard_failed", failure, {
    location: "scripts/hot-path-guard.mjs",
    suggestion: "Inspect the hot-path invariant and restore the expected bound, marker, or baseline.",
    safeNextStep: "Fix the reported hot-path issue, then rerun node scripts/hot-path-guard.mjs.",
  });
}

function printFailures(failures, options = {}) {
  printActionableFailureReport({
    title: options.title ?? "hot-path guard failed:",
    diagnostics: failures.map(hotPathDiagnostic),
    stream: options.stream ?? process.stderr,
  });
}

function parseArgs(argv) {
  const args = { rootDir: defaultRootDir, selfTest: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--root") args.rootDir = path.resolve(argv[++index]);
    else if (arg === "--self-test") args.selfTest = true;
    else {
      printFailures([`unknown argument ${arg}`]);
      process.exit(64);
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const hotPathMarker = /\bhot-path-ok\b/u;
const boundMarker = /\bmax(?:Bytes|Items|Pixels)\s*[:=]\s*[1-9][0-9_]*\b/u;
const reasonMarker = /\b(?:why|reason)\s*[:=]\s*\S+/u;

const excludedParts = new Set([".git", ".next", ".tmp", ".turbo", "build", ".build", "dist", "coverage", "node_modules", "vendor"]);
const excludedBasenames = new Set(["package-lock.json", "Cargo.lock", "discoverability.registry.json", "discoverability.md"]);
const allowedExtensions = new Set([".cjs", ".js", ".jsx", ".mjs", ".ts", ".tsx"]);
const scanRoots = ["apps", "bridge", "database", "delegation", "execution", "mcp", "monitor", "packages", "publishing", "relay", "runtime", "sessions"];

const riskRules = [
  {
    kind: "sync-sqlite-hot-path",
    pattern: /\b(?:new\s+Database\s*\(|better-sqlite3|\.prepare\s*\(|\.exec\s*\()/u,
    context: "node-handler",
  },
  {
    kind: "buffer-concat-hot-path",
    pattern: /\bBuffer\.concat\s*\(/u,
    context: "node-handler",
  },
  {
    kind: "json-parse-hot-path",
    pattern: /\bJSON\.parse\s*\(/u,
    context: "node-handler",
  },
  {
    kind: "readfile-split-hot-path",
    pattern: /\breadFileSync\s*\([^)]*\)[\s\S]{0,220}\.split\s*\(/u,
    context: "node-handler",
    multiline: true,
  },
];

function relative(rootDir, absolutePath) {
  return path.relative(rootDir, absolutePath).split(path.sep).join("/");
}

function isDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(value);
}

function shouldSkip(relativePath) {
  const parts = relativePath.split("/");
  if (parts.some((part) => excludedParts.has(part))) return true;
  if (excludedBasenames.has(path.basename(relativePath))) return true;
  if (/\.generated\./u.test(path.basename(relativePath))) return true;
  if (path.basename(relativePath).includes("test-utils")) return true;
  if (path.basename(relativePath).endsWith(".min.js")) return true;
  return !allowedExtensions.has(path.extname(relativePath));
}

function listFiles(rootDir, relativeDir, output = []) {
  const absoluteDir = path.join(rootDir, relativeDir);
  if (!fs.existsSync(absoluteDir)) return output;
  for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
    const absolutePath = path.join(absoluteDir, entry.name);
    const relativePath = relative(rootDir, absolutePath);
    if (entry.isDirectory()) {
      if (!excludedParts.has(entry.name)) listFiles(rootDir, relativePath, output);
    } else if (entry.isFile() && !shouldSkip(relativePath)) {
      output.push(relativePath);
    }
  }
  return output;
}

function readText(rootDir, relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function readJson(rootDir, relativePath) {
  return JSON.parse(readText(rootDir, relativePath));
}

function lineNumberForOffset(text, offset) {
  return text.slice(0, offset).split(/\r?\n/u).length;
}

function contextWindow(lines, index, radius = 24) {
  return lines.slice(Math.max(0, index - radius), Math.min(lines.length, index + radius + 1)).join("\n");
}

function markerWindow(lines, index) {
  return lines.slice(Math.max(0, index - 3), Math.min(lines.length, index + 4)).join("\n");
}

function hasInlineException(lines, index) {
  const nearby = markerWindow(lines, index);
  return hotPathMarker.test(nearby) && boundMarker.test(nearby) && reasonMarker.test(nearby);
}

function nodeContext(relativePath, lines, index) {
  if (/\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(relativePath)) return false;
  if (/(?:^|\/)(?:ui|website)(?:\/|$)/u.test(relativePath)) return false;
  const pathSignal = /(?:^|\/)(?:server|routes?|runtime|realtime|ws|websocket)(?:\/|\.|-)|relay\/src\/|monitor\/src\/server\/|packages\/clawjs-node\/src\/runtime\//u.test(relativePath);
  const nearby = contextWindow(lines, index, 28);
  const codeSignal = /\b(?:app\.(?:get|post|put|delete|patch|route)|createServer|websocket\s*:\s*true|\.on\s*\(\s*["']data["']|addEventListener\s*\(\s*["']message["']|ReadableStream|TransformStream|async\s*\(\s*request|request\s*=>)\b/u.test(nearby);
  if (codeSignal) return "handler";
  if (pathSignal) return "hot-path-file";
  return false;
}

function matchesContext(rule, relativePath, lines, index) {
  const context = nodeContext(relativePath, lines, index);
  if (rule.context === "node-handler") return context === "handler";
  return Boolean(context);
}

function baselineKey(finding) {
  return `${finding.path}:${finding.riskKind}:${finding.linePattern}`;
}

function validateBaseline(rootDir, failures) {
  if (!fs.existsSync(path.join(rootDir, baselinePath))) {
    failures.push(`missing ${baselinePath}`);
    return new Set();
  }
  const baseline = readJson(rootDir, baselinePath);
  if (baseline.schemaVersion !== 1) failures.push(`${baselinePath} schemaVersion must be 1`);
  if (baseline.program !== "hot-path-guard") failures.push(`${baselinePath} program must be hot-path-guard`);
  if (!Array.isArray(baseline.entries)) failures.push(`${baselinePath}.entries must be an array`);
  const today = new Date().toISOString().slice(0, 10);
  const ids = new Set();
  const keys = new Set();
  for (const [index, entry] of (baseline.entries ?? []).entries()) {
    const label = entry.id || `entries[${index}]`;
    if (!entry.id) failures.push(`${label} is missing id`);
    if (ids.has(entry.id)) failures.push(`${label} duplicates id ${entry.id}`);
    ids.add(entry.id);
    for (const field of ["path", "linePattern", "riskKind", "ownerArea", "limitKind", "limitValue", "reason", "replacementPlan", "expiresAt"]) {
      if (entry[field] === undefined || entry[field] === "") failures.push(`${label} is missing ${field}`);
    }
    if (typeof entry.blocksRelease !== "boolean") failures.push(`${label} blocksRelease must be boolean`);
    if (entry.path && !fs.existsSync(path.join(rootDir, entry.path))) failures.push(`${label} path does not exist: ${entry.path}`);
    if (entry.expiresAt && !isDate(entry.expiresAt)) failures.push(`${label} expiresAt must be YYYY-MM-DD`);
    if (isDate(entry.expiresAt) && entry.expiresAt < today) failures.push(`${label} expired on ${entry.expiresAt}`);
    if (entry.path && entry.linePattern && fs.existsSync(path.join(rootDir, entry.path))) {
      const source = readText(rootDir, entry.path);
      if (!source.includes(entry.linePattern)) failures.push(`${label} linePattern is not present in ${entry.path}`);
    }
    const key = `${entry.path}:${entry.riskKind}:${entry.linePattern}`;
    if (keys.has(key)) failures.push(`${label} duplicates hot-path baseline key ${key}`);
    keys.add(key);
  }
  return keys;
}

function findMultilineRisk(content, rule) {
  const findings = [];
  for (const match of content.matchAll(new RegExp(rule.pattern.source, "gu"))) {
    findings.push({ offset: match.index ?? 0, snippet: match[0].replace(/\s+/gu, " ").trim().slice(0, 180) });
  }
  return findings;
}

function scanFile(rootDir, relativePath) {
  const content = readText(rootDir, relativePath);
  const lines = content.split(/\r?\n/u);
  const findings = [];
  for (const rule of riskRules) {
    if (rule.multiline) {
      for (const match of findMultilineRisk(content, rule)) {
        const line = lineNumberForOffset(content, match.offset);
        const index = line - 1;
        if (!matchesContext(rule, relativePath, lines, index) || hasInlineException(lines, index)) continue;
        findings.push({ path: relativePath, line, riskKind: rule.kind, linePattern: match.snippet, snippet: match.snippet });
      }
      continue;
    }
    for (const [index, line] of lines.entries()) {
      if (!rule.pattern.test(line)) continue;
      if (/^\s*import\s/u.test(line)) continue;
      if (!matchesContext(rule, relativePath, lines, index) || hasInlineException(lines, index)) continue;
      const linePattern = line.trim().slice(0, 180);
      findings.push({ path: relativePath, line: index + 1, riskKind: rule.kind, linePattern, snippet: linePattern });
    }
  }
  return findings;
}

function requireSnippet(rootDir, relativePath, snippet, failures) {
  const filePath = path.join(rootDir, relativePath);
  if (!fs.existsSync(filePath)) {
    failures.push(`missing ${relativePath}`);
    return;
  }
  if (!fs.readFileSync(filePath, "utf8").includes(snippet)) failures.push(`${relativePath} must include ${JSON.stringify(snippet)}`);
}

function checkRoot(rootDir) {
  const failures = [];
  requireSnippet(rootDir, "docs/governance/performance-governance.md", "Hot Path Guard P1", failures);
  requireSnippet(rootDir, "docs/decision-map.md", "scripts/hot-path-guard.mjs", failures);
  requireSnippet(rootDir, "package.json", "scripts/hot-path-guard.mjs", failures);
  const baselineKeys = validateBaseline(rootDir, failures);
  const files = [...new Set(scanRoots.flatMap((scanRoot) => listFiles(rootDir, scanRoot)))].sort();
  const findings = files.flatMap((file) => scanFile(rootDir, file));
  for (const finding of findings) {
    if (!baselineKeys.has(baselineKey(finding))) {
      failures.push(`${finding.path}:${finding.line} ${finding.riskKind} needs hot-path-ok with maxBytes/maxItems/maxPixels or ${baselinePath}: ${finding.snippet}`);
    }
  }
  return { failures, filesScanned: files.length, findings };
}

function writeFixture(rootDir, relativePath, content) {
  const filePath = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function fixtureDocs(rootDir, entries = []) {
  writeFixture(rootDir, "docs/governance/performance-governance.md", "# Performance Governance\n\n## Hot Path Guard P1\n\nHot path work needs bounded-size proof.\n");
  writeFixture(rootDir, "docs/decision-map.md", "scripts/hot-path-guard.mjs\n");
  writeFixture(rootDir, "package.json", JSON.stringify({ scripts: { "test:docs": "node ./scripts/hot-path-guard.mjs && node ./scripts/hot-path-guard.mjs --self-test" } }));
  writeFixture(rootDir, baselinePath, JSON.stringify({ schemaVersion: 1, program: "hot-path-guard", entries }, null, 2));
}

function expectFailure(rootDir, needle) {
  const result = spawnSync(process.execPath, [new URL(import.meta.url).pathname, "--root", rootDir], { encoding: "utf8" });
  if (result.status === 0 || !String(result.stderr).includes(needle)) {
    throw new Error(`expected failure containing ${needle}, got status ${result.status}: ${result.stderr}`);
  }
}

function expectPass(rootDir) {
  const result = spawnSync(process.execPath, [new URL(import.meta.url).pathname, "--root", rootDir], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`expected pass: ${result.stderr}`);
}

function runSelfTest() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hot-path-guard-"));
  try {
    fixtureDocs(tempRoot);
    writeFixture(tempRoot, "relay/src/server/app.ts", "app.post('/upload', async (request) => {\n  const body = Buffer.concat(chunks);\n});\n");
    expectFailure(tempRoot, "buffer-concat-hot-path");
    {
      const result = spawnSync(process.execPath, [new URL(import.meta.url).pathname, "--root", tempRoot], { encoding: "utf8" });
      if (!String(result.stderr).includes("code: hot_path_unbounded_operation")) throw new Error("self-test missed hot-path diagnostic code");
    }
    writeFixture(tempRoot, "relay/src/server/app.ts", "app.post('/upload', async (request) => {\n  // hot-path-ok maxBytes=65536 reason=route body parser caps request size\n  const body = Buffer.concat(chunks);\n});\n");
    expectPass(tempRoot);
    writeFixture(tempRoot, "monitor/src/server/routes.ts", "app.get('/db', async () => {\n  const db = new Database(path);\n  return db.prepare('select * from rows').all();\n});\n");
    expectFailure(tempRoot, "sync-sqlite-hot-path");
    writeFixture(tempRoot, "monitor/src/server/routes.ts", "");
    writeFixture(tempRoot, "monitor/src/server/json-routes.ts", "app.get('/json', async () => {\n  return JSON.parse(raw);\n});\n");
    expectFailure(tempRoot, "json-parse-hot-path");
    writeFixture(tempRoot, "monitor/src/server/json-routes.ts", "");
    writeFixture(tempRoot, "runtime/src/server/events.ts", "app.get('/audit', async () => {\n  const lines = fs.readFileSync(auditPath, 'utf8').split('\\n');\n  return lines;\n});\n");
    expectFailure(tempRoot, "readfile-split-hot-path");
    writeFixture(tempRoot, "runtime/src/server/events.ts", "");
    writeFixture(tempRoot, "runtime/src/offline-tool.ts", "function offlineTool(chunks) {\n  return Buffer.concat(chunks);\n}\n");
    expectPass(tempRoot);
    writeFixture(tempRoot, "relay/src/server/app.ts", "app.post('/upload', async (request) => {\n  const body = Buffer.concat(chunks);\n});\n");
    fixtureDocs(tempRoot, [{
      id: "expired-buffer-concat",
      path: "relay/src/server/app.ts",
      linePattern: "const body = Buffer.concat(chunks);",
      riskKind: "buffer-concat-hot-path",
      ownerArea: "relay",
      limitKind: "maxBytes",
      limitValue: "65536",
      reason: "self-test baseline",
      replacementPlan: "stream request body",
      expiresAt: "2000-01-01",
      blocksRelease: true,
    }]);
    expectFailure(tempRoot, "expired");
    const chunks = [];
    printFailures([
      "/Users/example/private/relay/src/server/app.ts:2 buffer-concat-hot-path needs hot-path-ok token sk-test-secret-123456",
      "expired-buffer-concat expired on 2000-01-01",
    ], { stream: { write: (chunk) => chunks.push(chunk) } });
    const output = chunks.join("");
    if (!output.includes("code: hot_path_unbounded_operation")) throw new Error("self-test missing hot path code");
    if (!output.includes("code: hot_path_baseline_invalid")) throw new Error("self-test missing baseline code");
    if (!output.includes("suggestion: Add an inline hot-path-ok marker")) throw new Error("self-test missing suggestion");
    if (!output.includes("next: Fix ~/private/relay/src/server/app.ts")) throw new Error("self-test missing redacted next step");
    if (output.includes("/Users/example") || output.includes("sk-test-secret-123456")) throw new Error("self-test leaked private data");
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

if (args.selfTest) {
  runSelfTest();
  console.log("hot-path guard self-test passed");
  process.exit(0);
}

const result = checkRoot(args.rootDir);
if (result.failures.length > 0) {
  printFailures(result.failures);
  process.exit(1);
}

console.log(`hot-path guard passed (${result.filesScanned} files scanned, ${result.findings.length} findings baselined)`);
