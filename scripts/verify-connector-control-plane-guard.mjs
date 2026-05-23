#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createDiagnostic, printActionableFailureReport } from "./actionable-error.mjs";

const errors = [];

if (process.argv.includes("--self-test")) {
  runSelfTest();
  process.exit(0);
}

const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8" })
  .split("\n")
  .filter(Boolean)
  .filter((file) => /\.(?:ts|tsx|js|mjs)$/.test(file))
  .filter((file) => !file.includes("/dist/"))
  .filter((file) => !file.includes("/node_modules/"))
  .filter((file) => !/(\.|\/)(?:test|spec)\.[cm]?[jt]sx?$/.test(file))
  .filter((file) => !file.includes("/tests/"));

for (const file of tracked) {
  if (!fs.existsSync(file)) continue;
  const text = fs.readFileSync(file, "utf8");
  checkConnectorRunnerCalls(file, text);
}

checkRequiredSource(
  "packages/clawjs-mcp/src/client.ts",
  [
    "controlPlane: MCPConnectorControlPlaneInput",
    "prefixedName,",
    "args,",
    "controlPlane,",
  ],
);
checkRequiredSource(
  "packages/clawjs-mcp/src/app.ts",
  [
    "assertMCPToolControlPlane({ server, tool, controlPlane: body.controlPlane, agentPolicy: body.agentPolicy })",
    "protocol.callTool(tool.toolName, body.args ?? {})",
  ],
);
checkRequiredSource(
  "mcp/src/bin/cli.ts",
  [
    "mcp tools call requires --control-plane JSON",
    "JSON.parse(flags[\"control-plane\"])",
  ],
);
checkRequiredSource(
  "packages/clawjs-integrations/src/command-adapter.ts",
  [
    "runtimeKind: \"cli\"",
    "External CLI adapter execution requires connector control plane approval.",
    "requires local evidence",
  ],
);
checkRequiredSource(
  "docs/connector-control-plane.md",
  [
    "Use `connectors` for the strict control plane.",
    "Integration packages provide",
    "runtime adapters, but public policy language",
  ],
);
checkRequiredSource(
  "docs/adr/0015-connector-control-plane-v1.md",
  [
    "`integrations` remains a",
    "discovery alias",
  ],
);
checkRequiredSource(
  "packages/clawjs-core/src/cli-command-registry.ts",
  [
    "Discovery alias delegated to connectors.",
  ],
);
checkRequiredSource(
  "packages/clawjs/src/inspect-cli.ts",
  [
    "discoveryAlias: \"integrations\"",
  ],
);
forbidSource(
  "docs/connector-control-plane.md",
  [
    "integrations remains a legacy",
    "legacy category alias",
  ],
);
forbidSource(
  "docs/adr/0015-connector-control-plane-v1.md",
  [
    "integrations remains a legacy",
    "legacy category alias",
  ],
);
forbidSource(
  "packages/clawjs-core/src/cli-command-registry.ts",
  [
    "Legacy category alias",
  ],
);
forbidSource(
  "packages/clawjs/src/inspect-cli.ts",
  [
    "legacyAlias",
  ],
);
forbidSource(
  "packages/clawjs/src/inspect-cli.test.ts",
  [
    "legacyAlias",
  ],
);

if (errors.length > 0) {
  printActionableFailureReport({
    title: `Connector control-plane guard failed with ${errors.length} issue(s):`,
    diagnostics: errors,
  });
  process.exit(1);
}

console.log("Connector control-plane guard passed.");

function checkConnectorRunnerCalls(file, text) {
  for (const callee of ["runConnectorOperation", "runConnectorSource"]) {
    let index = 0;
    while ((index = text.indexOf(`${callee}(`, index)) !== -1) {
      const openParen = text.indexOf("(", index);
      const openBrace = nextNonWhitespaceIndex(text, openParen + 1);
      if (text[openBrace] !== "{") {
        index = openParen + 1;
        continue;
      }
      const closeBrace = findMatching(text, openBrace, "{", "}");
      if (closeBrace === -1) {
        addError("connector_control_plane_parse_failed", `${file}: could not parse ${callee} object literal`, {
          location: file,
          suggestion: "Keep connector runner calls in a parseable object-literal shape.",
          safeNextStep: `Fix the ${callee} call shape in ${file}, then rerun node scripts/verify-connector-control-plane-guard.mjs.`,
        });
        index = openParen + 1;
        continue;
      }
      const objectText = text.slice(openBrace, closeBrace + 1);
      if (/\bdryRun\s*:\s*false\b/.test(objectText) && !/\bcontrolPlane\s*:/.test(objectText)) {
        addError("connector_control_plane_missing_approval", `${file}: ${callee} with dryRun:false must pass controlPlane`, {
          location: file,
          suggestion: "Require the strict connector control plane for non-dry-run connector execution.",
          safeNextStep: `Pass controlPlane into ${callee} or keep the operation dry-run, then rerun node scripts/verify-connector-control-plane-guard.mjs.`,
        });
      }
      index = closeBrace + 1;
    }
  }
}

function checkRequiredSource(file, needles) {
  if (!fs.existsSync(file)) {
    addError("connector_control_plane_source_missing", `${file}: missing required connector control-plane source`, {
      location: file,
      suggestion: "Restore the source that anchors connector control-plane enforcement.",
      safeNextStep: `Restore ${file} or update the guard with an equivalent reviewed source, then rerun node scripts/verify-connector-control-plane-guard.mjs.`,
    });
    return;
  }
  const text = fs.readFileSync(file, "utf8");
  for (const needle of needles) {
    if (!text.includes(needle)) {
      addError("connector_control_plane_required_snippet_missing", `${file}: missing ${JSON.stringify(needle)}`, {
        location: file,
        suggestion: "Restore the connector control-plane contract snippet or update the guard with the new reviewed wording.",
        safeNextStep: `Restore the missing snippet in ${file}, then rerun node scripts/verify-connector-control-plane-guard.mjs.`,
      });
    }
  }
}

function forbidSource(file, needles) {
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, "utf8");
  for (const needle of needles) {
    if (text.includes(needle)) {
      addError("connector_control_plane_forbidden_snippet", `${file}: contains forbidden ${JSON.stringify(needle)}`, {
        location: file,
        suggestion: "Use the current connector/control-plane terminology and avoid deprecated alias wording.",
        safeNextStep: `Remove or replace the forbidden snippet in ${file}, then rerun node scripts/verify-connector-control-plane-guard.mjs.`,
      });
    }
  }
}

function addError(code, message, options = {}) {
  errors.push(createDiagnostic(code, message, {
    location: options.location ?? "scripts/verify-connector-control-plane-guard.mjs",
    suggestion: options.suggestion ?? "Keep connector writes behind the strict control-plane boundary.",
    safeNextStep: options.safeNextStep ?? "Fix the reported connector control-plane issue, then rerun node scripts/verify-connector-control-plane-guard.mjs.",
  }));
}

function runSelfTest() {
  const chunks = [];
  printActionableFailureReport({
    title: "Connector control-plane guard failed for /Users/example/private:",
    diagnostics: [
      createDiagnostic("connector_control_plane_missing_approval", "packages/clawjs/src/direct.ts: runConnectorOperation with dryRun:false must pass token: sk-test-secret-123456", {
        location: "/Users/example/private/packages/clawjs/src/direct.ts",
        suggestion: "Require the strict connector control plane for non-dry-run connector execution.",
        safeNextStep: "Pass controlPlane into runConnectorOperation, then rerun node scripts/verify-connector-control-plane-guard.mjs.",
      }),
      createDiagnostic("connector_control_plane_required_snippet_missing", "docs/connector-control-plane.md: missing required snippet", {
        location: "docs/connector-control-plane.md",
        suggestion: "Restore the connector control-plane contract snippet or update the guard with the new reviewed wording.",
        safeNextStep: "Restore the missing snippet, then rerun node scripts/verify-connector-control-plane-guard.mjs.",
      }),
    ],
    stream: { write: (chunk) => chunks.push(chunk) },
  });
  const output = chunks.join("");
  assert.match(output, /code: connector_control_plane_missing_approval/);
  assert.match(output, /code: connector_control_plane_required_snippet_missing/);
  assert.match(output, /location: ~\/private\/packages\/clawjs\/src\/direct\.ts/);
  assert.match(output, /suggestion: Require the strict connector control plane/);
  assert.match(output, /next: Pass controlPlane into runConnectorOperation/);
  assert.doesNotMatch(output, /\/Users\/example/);
  assert.doesNotMatch(output, /sk-test-secret-123456/);
  console.log("connector control-plane guard self-test passed");
}

function nextNonWhitespaceIndex(text, start) {
  let index = start;
  while (index < text.length && /\s/.test(text[index])) index += 1;
  return index;
}

function findMatching(text, start, open, close) {
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === "\"" || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === open) depth += 1;
    if (char === close) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}
