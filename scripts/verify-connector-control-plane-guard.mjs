#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8" })
  .split("\n")
  .filter(Boolean)
  .filter((file) => /\.(?:ts|tsx|js|mjs)$/.test(file))
  .filter((file) => !file.includes("/dist/"))
  .filter((file) => !file.includes("/node_modules/"))
  .filter((file) => !/(\.|\/)(?:test|spec)\.[cm]?[jt]sx?$/.test(file))
  .filter((file) => !file.includes("/tests/"));

const errors = [];

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
  console.error(`Connector control-plane guard failed with ${errors.length} issue(s):`);
  for (const error of errors) console.error(`- ${error}`);
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
        errors.push(`${file}: could not parse ${callee} object literal`);
        index = openParen + 1;
        continue;
      }
      const objectText = text.slice(openBrace, closeBrace + 1);
      if (/\bdryRun\s*:\s*false\b/.test(objectText) && !/\bcontrolPlane\s*:/.test(objectText)) {
        errors.push(`${file}: ${callee} with dryRun:false must pass controlPlane`);
      }
      index = closeBrace + 1;
    }
  }
}

function checkRequiredSource(file, needles) {
  if (!fs.existsSync(file)) {
    errors.push(`${file}: missing required connector control-plane source`);
    return;
  }
  const text = fs.readFileSync(file, "utf8");
  for (const needle of needles) {
    if (!text.includes(needle)) {
      errors.push(`${file}: missing ${JSON.stringify(needle)}`);
    }
  }
}

function forbidSource(file, needles) {
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, "utf8");
  for (const needle of needles) {
    if (text.includes(needle)) {
      errors.push(`${file}: contains forbidden ${JSON.stringify(needle)}`);
    }
  }
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
