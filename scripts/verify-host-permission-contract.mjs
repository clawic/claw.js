#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createDiagnostic, printActionableFailureReport } from "./actionable-error.mjs";

const rootDir = path.resolve(new URL("..", import.meta.url).pathname);
const allowlistPath = "docs/mac-native-usage-allowlist.json";
const today = new Date().toISOString().slice(0, 10);

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

function addDiagnostic(diagnostics, code, message, options = {}) {
  diagnostics.push(createDiagnostic(code, message, {
    location: options.location ?? "scripts/verify-host-permission-contract.mjs",
    suggestion: options.suggestion ?? "Keep native permission access behind the bridge/host boundary.",
    safeNextStep: options.safeNextStep ?? "Fix the reported contract or allowlist entry, then rerun node scripts/verify-host-permission-contract.mjs.",
  }));
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
  if (allowlist.version !== 1) {
    addDiagnostic(errors, "host_permission_allowlist_invalid", `${allowlistPath} version must be 1`, {
      location: allowlistPath,
      suggestion: "Use the current host permission allowlist schema version.",
    });
  }
  const allowedByPath = new Map();
  const seen = new Set();
  for (const entry of allowlist.entries ?? []) {
    const label = entry.path ?? "<missing path>";
    if (!entry.path || typeof entry.path !== "string") {
      addDiagnostic(errors, "host_permission_allowlist_entry_invalid", `${allowlistPath}: entry is missing path`, {
        location: allowlistPath,
        suggestion: "Give every allowlist entry the exact repo-relative source path it covers.",
      });
    }
    if (seen.has(entry.path)) {
      addDiagnostic(errors, "host_permission_allowlist_entry_duplicate", `${allowlistPath}: duplicate path ${entry.path}`, {
        location: allowlistPath,
        suggestion: "Keep one reviewed allowlist entry per source path.",
      });
    }
    seen.add(entry.path);
    if (entry.path && !fs.existsSync(path.join(rootDir, entry.path))) {
      addDiagnostic(errors, "host_permission_allowlist_path_missing", `${allowlistPath}: ${entry.path} does not exist`, {
        location: allowlistPath,
        suggestion: "Remove stale entries or update them to the moved source path.",
      });
    }
    if (!entry.owner) {
      addDiagnostic(errors, "host_permission_allowlist_entry_incomplete", `${allowlistPath}: ${label} is missing owner`, {
        location: allowlistPath,
        suggestion: "Record the owner responsible for this native permission exception.",
      });
    }
    if (!entry.reason) {
      addDiagnostic(errors, "host_permission_allowlist_entry_incomplete", `${allowlistPath}: ${label} is missing reason`, {
        location: allowlistPath,
        suggestion: "Record why this native permission exception is required.",
      });
    }
    if (!Array.isArray(entry.allowedViolations) || entry.allowedViolations.length === 0) {
      addDiagnostic(errors, "host_permission_allowlist_entry_incomplete", `${allowlistPath}: ${label} must declare allowedViolations`, {
        location: allowlistPath,
        suggestion: "Declare the exact native permission patterns this path may contain.",
      });
    }
    for (const violation of entry.allowedViolations ?? []) {
      if (!sensitiveNativePermissionNames.has(violation)) {
        addDiagnostic(errors, "host_permission_allowlist_unknown_violation", `${allowlistPath}: ${label} allows unknown violation ${violation}`, {
          location: allowlistPath,
          suggestion: "Use one of the known native permission violation names.",
        });
      }
    }
    if (entry.expiresOn && !/^\d{4}-\d{2}-\d{2}$/.test(entry.expiresOn)) {
      addDiagnostic(errors, "host_permission_allowlist_expiry_invalid", `${allowlistPath}: ${label} expiresOn must be YYYY-MM-DD`, {
        location: allowlistPath,
        suggestion: "Use an ISO date so expiry comparisons are stable.",
      });
    }
    if (entry.expiresOn && entry.expiresOn < today) {
      addDiagnostic(errors, "host_permission_allowlist_expired", `${allowlistPath}: ${label} expired on ${entry.expiresOn}`, {
        location: allowlistPath,
        suggestion: "Remove the exception or renew it with current review and tests.",
      });
    }
    if (!Array.isArray(entry.tests) || entry.tests.length === 0) {
      addDiagnostic(errors, "host_permission_allowlist_entry_incomplete", `${allowlistPath}: ${label} must declare tests`, {
        location: allowlistPath,
        suggestion: "Record the test command that proves this exception remains bounded.",
      });
    }
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
    addDiagnostic(errors, "host_permission_contract_snippet_missing", `${relativePath} is missing required snippet: ${snippet}`, {
      location: relativePath,
      suggestion: "Restore the host-boundary contract hook before changing native permission routing.",
      safeNextStep: `Restore or intentionally update ${relativePath}, then rerun node scripts/verify-host-permission-contract.mjs.`,
    });
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
        addDiagnostic(errors, "host_permission_direct_native_reference", `${relativePath} directly references host-owned native permission surface: ${violations.join(", ")}`, {
          location: relativePath,
          suggestion: "Route native permission work through the bridge/host permission contract instead of direct app/framework code.",
          safeNextStep: "Move the direct native call behind the host-owned bridge surface or add a reviewed allowlist entry with tests.",
        });
      }
    }
  }

  requireSnippet(errors, "bridge/src/tcc-job-handler.ts", "export interface TccAuditSink");
  requireSnippet(errors, "bridge/src/tcc-job-handler.ts", "auditOk(ctx, input, jobId)");
  requireSnippet(errors, "bridge/src/tcc-job-handler.ts", "auditFail(ctx, input, jobId, message)");
  requireSnippet(errors, "bridge/src/tcc-job-handler.ts", 'input.method.startsWith("tcc.computer.")');
  requireSnippet(errors, "bridge/src/server.ts", "audit: auditSink");
  requireSnippet(errors, "bridge/src/server.ts", "actorId: senderId");
  requireSnippet(errors, "packages/clawjs-core/src/surface-registry-graph.ts", "never Node-only code");
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
  const chunks = [];
  printActionableFailureReport({
    title: "Host permission contract guard failed for /Users/example/private:",
    diagnostics: [
      createDiagnostic("host_permission_direct_native_reference", "packages/clawjs/src/direct.ts directly references host-owned native permission surface: token: sk-test-secret-123456", {
        location: "/Users/example/private/packages/clawjs/src/direct.ts",
        suggestion: "Route native permission work through the bridge/host permission contract instead.",
        safeNextStep: "Move the call behind the bridge or add a reviewed allowlist entry with tests.",
      }),
    ],
    stream: { write: (chunk) => chunks.push(chunk) },
  });
  const output = chunks.join("");
  assert.match(output, /code: host_permission_direct_native_reference/);
  assert.match(output, /location: ~\/private\/packages\/clawjs\/src\/direct\.ts/);
  assert.match(output, /suggestion: Route native permission work through the bridge\/host permission contract/);
  assert.match(output, /next: Move the call behind the bridge/);
  assert.doesNotMatch(output, /\/Users\/example/);
  assert.doesNotMatch(output, /sk-test-secret-123456/);
}

if (process.argv.includes("--self-test")) {
  runSelfTest();
  console.log("Host permission contract guard self-test passed");
  process.exit(0);
}

const errors = validate();
if (errors.length > 0) {
  printActionableFailureReport({
    title: "Host permission contract guard failed:",
    diagnostics: errors,
  });
  process.exit(1);
}

console.log("Host permission contract guard passed");
