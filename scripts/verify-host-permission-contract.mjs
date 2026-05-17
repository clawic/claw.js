#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const rootDir = path.resolve(new URL("..", import.meta.url).pathname);
const allowlistPath = "docs/mac-native-usage-allowlist.json";
const today = "2026-05-17";

const implementationRoots = [
  "apps",
  "audio",
  "bridge",
  "content",
  "database",
  "delegation",
  "drive",
  "execution",
  "integrations",
  "iot",
  "mcp",
  "memory",
  "modules",
  "monitor",
  "notify",
  "packages",
  "publishing",
  "relay",
  "runtime",
  "secrets",
  "sessions",
  "storage",
  "time",
  "wiki",
];

const sourceExtensions = new Set([".cjs", ".cts", ".js", ".jsx", ".mjs", ".mts", ".ts", ".tsx"]);
const skippedDirs = new Set([
  ".data",
  ".next",
  ".tmp",
  "artifacts",
  "coverage",
  "dist",
  "fixtures",
  "node_modules",
  "output",
  "test-results",
  "tests",
  "__fixtures__",
  "__tests__",
]);

const sensitiveNativePermissionPatterns = [
  { name: "TCC computer method", pattern: /\btcc\.computer\./ },
  { name: "macOS screenshot permission command", pattern: /["'`]screencapture["'`]/ },
  { name: "macOS accessibility input helper", pattern: /["'`]cliclick["'`]/ },
  { name: "macOS System Events automation", pattern: /\bSystem Events\b/ },
];
const sensitiveNativePermissionNames = new Set(sensitiveNativePermissionPatterns.map((entry) => entry.name));

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

function listFiles(relativeDir, output = []) {
  const absoluteDir = path.join(rootDir, relativeDir);
  if (!fs.existsSync(absoluteDir)) return output;
  for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
    if (skippedDirs.has(entry.name)) continue;
    const relativePath = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      listFiles(relativePath, output);
    } else if (entry.isFile()) {
      output.push(relativePath);
    }
  }
  return output;
}

function shouldScan(relativePath) {
  if (!sourceExtensions.has(path.extname(relativePath))) return false;
  const basename = path.basename(relativePath);
  return !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(basename);
}

function loadAllowlist(errors = []) {
  const allowlist = readJson(allowlistPath);
  if (allowlist.version !== 1) errors.push(`${allowlistPath} version must be 1`);
  const allowedByPath = new Map();
  const seen = new Set();
  for (const entry of allowlist.entries ?? []) {
    const label = entry.path ?? "<missing path>";
    if (!entry.path || typeof entry.path !== "string") errors.push(`${allowlistPath}: entry is missing path`);
    if (seen.has(entry.path)) errors.push(`${allowlistPath}: duplicate path ${entry.path}`);
    seen.add(entry.path);
    if (entry.path && !fs.existsSync(path.join(rootDir, entry.path))) errors.push(`${allowlistPath}: ${entry.path} does not exist`);
    if (!entry.owner) errors.push(`${allowlistPath}: ${label} is missing owner`);
    if (!entry.reason) errors.push(`${allowlistPath}: ${label} is missing reason`);
    if (!Array.isArray(entry.allowedViolations) || entry.allowedViolations.length === 0) {
      errors.push(`${allowlistPath}: ${label} must declare allowedViolations`);
    }
    for (const violation of entry.allowedViolations ?? []) {
      if (!sensitiveNativePermissionNames.has(violation)) errors.push(`${allowlistPath}: ${label} allows unknown violation ${violation}`);
    }
    if (entry.expiresOn && !/^\d{4}-\d{2}-\d{2}$/.test(entry.expiresOn)) errors.push(`${allowlistPath}: ${label} expiresOn must be YYYY-MM-DD`);
    if (entry.expiresOn && entry.expiresOn < today) errors.push(`${allowlistPath}: ${label} expired on ${entry.expiresOn}`);
    if (!Array.isArray(entry.tests) || entry.tests.length === 0) errors.push(`${allowlistPath}: ${label} must declare tests`);
    allowedByPath.set(entry.path, new Set(entry.allowedViolations ?? []));
  }
  return allowedByPath;
}

function nativePermissionViolations(relativePath, text, allowedByPath = new Map()) {
  const allowed = allowedByPath.get(relativePath) ?? new Set();
  const matches = [];
  for (const { name, pattern } of sensitiveNativePermissionPatterns) {
    if (pattern.test(text) && !allowed.has(name)) matches.push(name);
  }
  return matches;
}

function requireSnippet(errors, relativePath, snippet) {
  if (!read(relativePath).includes(snippet)) {
    errors.push(`${relativePath} is missing required snippet: ${snippet}`);
  }
}

function validate() {
  const errors = [];
  const allowedByPath = loadAllowlist(errors);
  for (const root of implementationRoots) {
    for (const relativePath of listFiles(root)) {
      if (!shouldScan(relativePath)) continue;
      const violations = nativePermissionViolations(relativePath, read(relativePath), allowedByPath);
      if (violations.length > 0) {
        errors.push(`${relativePath} directly references host-owned native permission surface: ${violations.join(", ")}`);
      }
    }
  }

  requireSnippet(errors, "bridge/src/tcc-job-handler.ts", "export interface TccAuditSink");
  requireSnippet(errors, "bridge/src/tcc-job-handler.ts", "auditOk(ctx, input, jobId)");
  requireSnippet(errors, "bridge/src/tcc-job-handler.ts", "auditFail(ctx, input, jobId, message)");
  requireSnippet(errors, "bridge/src/tcc-job-handler.ts", 'input.method.startsWith("tcc.computer.")');
  requireSnippet(errors, "bridge/src/server.ts", "audit: auditSink");
  requireSnippet(errors, "bridge/src/server.ts", "actorId: senderId");
  requireSnippet(errors, "packages/clawjs-core/src/surface-registry.ts", "never Node-only code");
  requireSnippet(errors, "docs/decision-map.md", "scripts/verify-host-permission-contract.mjs");
  requireSnippet(errors, "docs/mac-control-plane.md", allowlistPath);

  return errors;
}

function runSelfTest() {
  const allowlist = new Map([
    ["bridge/src/computer-use.ts", new Set(["macOS screenshot permission command", "macOS accessibility input helper", "macOS System Events automation"])],
  ]);
  assert.deepEqual(
    nativePermissionViolations("packages/clawjs/src/direct.ts", 'spawn("screencapture")'),
    ["macOS screenshot permission command"],
  );
  assert.deepEqual(
    nativePermissionViolations("packages/clawjs/src/direct.ts", 'const method = "tcc.computer.screenshot";'),
    ["TCC computer method"],
  );
  assert.deepEqual(
    nativePermissionViolations("packages/clawjs/src/direct.ts", 'const script = "tell application \\"System Events\\"";'),
    ["macOS System Events automation"],
  );
  assert.deepEqual(
    nativePermissionViolations("packages/clawjs-node/src/host/process.ts", 'command: "osascript"; "Terminal"'),
    [],
  );
  assert.deepEqual(
    nativePermissionViolations("bridge/src/computer-use.ts", 'command: "screencapture"; "System Events"', allowlist),
    [],
  );
  assert.deepEqual(
    nativePermissionViolations("bridge/src/computer-use.ts", 'const method = "tcc.computer.screenshot";', allowlist),
    ["TCC computer method"],
  );
}

if (process.argv.includes("--self-test")) {
  runSelfTest();
  console.log("Host permission contract guard self-test passed");
  process.exit(0);
}

const errors = validate();
if (errors.length > 0) {
  console.error("Host permission contract guard failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("Host permission contract guard passed");
