#!/usr/bin/env node

import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const TEST_DOCS_COMMANDS = [
  "node ./scripts/supply-chain-security-check.mjs",
  "node ./scripts/docs-surface-check.mjs",
  "node ./scripts/test-docs-report-self-test.mjs",
  "node ./scripts/constitution-assertions-check.mjs",
  "node ./scripts/constitution-assertions-check.mjs --self-test",
  "node ./scripts/constitution-sync-check.mjs",
  "node ./scripts/constitution-sync-check.mjs --self-test",
  "node ./scripts/docs-alignment-check.mjs",
  "npm run test:storage-boundary",
  "node ./scripts/source-decision-audit-check.mjs",
  "node ./scripts/source-decision-audit-check.mjs --self-test",
  "node ./scripts/rfc-process-check.mjs",
  "node ./scripts/rfc-process-check.mjs --self-test",
  "node ./scripts/performance-governance-check.mjs",
  "node ./scripts/performance-governance-check.mjs --self-test",
  "node ./scripts/problem-to-guardrail-check.mjs",
  "node ./scripts/problem-to-guardrail-check.mjs --self-test",
  "node --import tsx ./scripts/streaming-backpressure-contract-check.mjs",
  "node --import tsx ./scripts/streaming-backpressure-contract-check.mjs --self-test",
  "node ./scripts/hot-path-guard.mjs",
  "node ./scripts/hot-path-guard.mjs --self-test",
  "node ./scripts/boundedness-guard.mjs",
  "node ./scripts/boundedness-guard.mjs --self-test",
  "node ./scripts/idle-quiescence-check.mjs",
  "node ./scripts/idle-quiescence-check.mjs --self-test",
  "node ./scripts/no-irreversible-data-loss-check.mjs",
  "node ./scripts/no-irreversible-data-loss-check.mjs --self-test",
  "node ./scripts/portable-archive-governance-check.mjs",
  "node ./scripts/adoption-canonicity-check.mjs",
  "node ./scripts/adoption-canonicity-check.mjs --self-test",
  "node ./scripts/security-threat-model-check.mjs",
  "node ./scripts/security-threat-model-check.mjs --self-test",
  "node ./scripts/incident-response-check.mjs",
  "node ./scripts/incident-response-check.mjs --self-test",
  "node ./scripts/agent-instructions-check.mjs",
  "node ./scripts/docs-rendered-link-check.mjs",
  "node ./scripts/verify-host-permission-contract.mjs",
  "node ./scripts/skills-check.mjs",
  "node ./scripts/discoverability-check.mjs generate --check --no-cli",
  "node ./scripts/discoverability-check.mjs audit --no-cli",
  "node ./scripts/discoverability-check.mjs",
  "node ./scripts/discoverability-check.mjs --self-test",
  "node ./scripts/adr-operational-coverage-check.mjs",
  "node ./scripts/adr-operational-coverage-check.mjs --self-test",
  "node ./scripts/discoverability-check.mjs golden-queries",
  "node ./scripts/open-source-canonicity-check.mjs",
  "node ./scripts/open-source-canonicity-check.mjs --self-test",
  "node ./scripts/naming-surface-guard.mjs",
  "node ./scripts/naming-shape-check.mjs",
  "node ./scripts/conceptual-vocabulary-guard.mjs",
  "node ./scripts/verify-technical-tenancy-contract.mjs",
  "node ./scripts/verify-identity-scope-contract.mjs",
  "node ./scripts/verify-full-surface-vocabulary-contract.mjs",
  "npm run test:governance",
  "node ./scripts/package-surface-guard.mjs --self-test",
  "node ./scripts/package-surface-guard.mjs --owner clawjs .",
  "node ./scripts/verify-source-mode.mjs",
  "node ./scripts/zero-accidental-work-guard.mjs",
  "node ./scripts/progressive-modularity-guard.mjs",
  "node --import tsx ./scripts/generate-cli-router.mjs --check",
  "node ./scripts/verify-cli-base-imports.mjs --self-test",
  "node ./scripts/verify-cli-base-imports.mjs",
  "node --import tsx ./scripts/verify-cli-registry-router-parity.mjs",
  "node --import tsx ./scripts/domain-surface-registry-guard.mjs",
  "node --import tsx ./scripts/surface-route-graph-guard.mjs",
  "node --import tsx ./scripts/surface-route-graph-guard.mjs --self-test",
  "node --import tsx ./scripts/verify-surface-route-graph-goal.mjs",
  "node --import tsx ./scripts/verify-surface-route-graph-goal.mjs --self-test",
  "node --import tsx ./scripts/surface-evidence-guard.mjs",
  "node --import tsx ./scripts/surface-evidence-guard.mjs --self-test",
  "node --import tsx ./scripts/surface-narrative-guard.mjs",
  "node --import tsx ./scripts/surface-narrative-guard.mjs --self-test",
  "node --import tsx ./scripts/surface-resource-contract-guard.mjs",
  "node --import tsx ./scripts/surface-resource-contract-guard.mjs --self-test",
  "node ./scripts/verify-domain-surface-decision-matrix.mjs",
  "npm run test:dense-data-goal",
  "npm run test:remote-sync-goal",
  "npm run test:surface-route-goal",
  "npm run test:connector-governed-context-goal",
  "npm run test:search-goal",
  "npm run test:system-telemetry-goal",
  "npm run test:sdk-first-custom-surfaces-goal",
  "node --import tsx ./scripts/verify-regulated-domain-safety-goal.mjs",
  "node ./scripts/verify-cli-json-envelope-debt.mjs",
  "node ./scripts/cross-process-json-contracts-check.mjs",
  "node ./scripts/cross-process-json-contracts-check.mjs --self-test",
  "vitest run packages/clawjs-core/src/cross-process-json-boundary.test.ts packages/clawjs/src/cli-json.test.ts",
  "npm run test:persistent-surface-guard",
  "node ./scripts/persistent-surface-doc-check.mjs --self-test",
  "node ./scripts/persistent-surface-doc-check.mjs",
  "node ./scripts/verify-connector-control-plane-guard.mjs --self-test",
  "node ./scripts/verify-connector-control-plane-guard.mjs",
  "node ./scripts/version-governance-check.mjs",
  "node ./scripts/version-governance-check.mjs --self-test",
  "node ./scripts/evolution-governance-check.mjs",
  "node ./scripts/evolution-governance-check.mjs --self-test",
  "node ./scripts/tracked-ignored-check.mjs --self-test",
  "node ./scripts/tracked-ignored-check.mjs",
  "node ./scripts/codebase-manifest.mjs --check",
  "node ./scripts/source-size-check.mjs",
  "node ./scripts/code-hygiene-check.mjs",
  "node ./scripts/code-hygiene-check.mjs --self-test",
  "node ./scripts/code-hygiene-audit.mjs --self-test",
  "node ./scripts/code-hygiene-knip.mjs --self-test",
  "node ./scripts/code-hygiene-periphery.mjs --self-test"
];

const DEFAULT_REPORT_FILE = ".test-docs-report.json";
const TIMESTAMP_PATTERN =
  /\b\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)?\b/g;
const ANSI_PATTERN = /\u001b\[[0-9;]*m/g;

function readFlagValue(args, name) {
  const exactIndex = args.indexOf(name);
  if (exactIndex >= 0) return args[exactIndex + 1];
  const prefix = `${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  return inline ? inline.slice(prefix.length) : undefined;
}

function splitScript(script) {
  return script
    .split(/\s+&&\s+/)
    .map((command) => command.trim())
    .filter(Boolean);
}

function npmRunName(command) {
  const match = command.match(/^npm\s+run\s+([^\s]+)$/);
  return match?.[1];
}

async function loadPackageScripts(repoRoot) {
  const raw = await readFile(path.join(repoRoot, "package.json"), "utf8");
  return JSON.parse(raw).scripts ?? {};
}

async function expandCommands(commands, repoRoot, { expandNpmScripts }) {
  if (!expandNpmScripts) return commands;
  const packageScripts = await loadPackageScripts(repoRoot);
  const expanded = [];
  for (const command of commands) {
    const scriptName = npmRunName(command);
    const script = scriptName ? packageScripts[scriptName] : undefined;
    if (script && scriptName !== "test:docs") {
      expanded.push(...splitScript(script));
    } else {
      expanded.push(command);
    }
  }
  return expanded;
}

function commandTarget(command) {
  const scriptMatch = command.match(/(?:^|\s)(\.\/)?(scripts\/[^\s'"]+)/);
  if (scriptMatch) return scriptMatch[2];

  const npmMatch = command.match(/^npm\s+run\s+([^\s]+)/);
  if (npmMatch) return `package.json#scripts.${npmMatch[1]}`;

  if (command.startsWith("vitest ")) return command.replace(/\s+/g, " ");
  return command.replace(/\s+/g, " ");
}

function guardName(command, target) {
  if (target.startsWith("scripts/")) {
    return path.basename(target).replace(/\.mjs$/, "");
  }
  if (target.startsWith("package.json#scripts.")) {
    return target.slice("package.json#scripts.".length);
  }
  return command.split(/\s+/)[0] || "unknown";
}

function normalizeOutput(text, repoRoot) {
  const escapedRoot = repoRoot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text
    .replace(ANSI_PATTERN, "")
    .replace(new RegExp(escapedRoot, "g"), "<repo>")
    .replace(/\/var\/folders\/[^\s:]+/g, "<tmp>")
    .replace(/\/tmp\/[^\s:]+/g, "<tmp>")
    .replace(TIMESTAMP_PATTERN, "<ts>")
    .replace(/\b\d+:\d+\b/g, "<line:col>")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function failureSignature({ command, status, signal, stdout, stderr, repoRoot }) {
  const source = normalizeOutput(`${stderr}\n${stdout}`, repoRoot);
  const lines = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("> "));
  const detail = lines.slice(0, 8).join(" | ") || "no diagnostic output";
  return `exit=${status ?? "signal"}${signal ? ` signal=${signal}` : ""} command=${command} :: ${detail}`;
}

function runCommand(command, { cwd, stream }) {
  return new Promise((resolve) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      env: process.env,
      stdio: stream ? "inherit" : ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    if (!stream) {
      child.stdout?.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr?.on("data", (chunk) => {
        stderr += chunk.toString();
      });
    }

    child.on("close", (status, signal) => {
      resolve({ status, signal, stdout, stderr });
    });
  });
}

async function loadCommands(args) {
  const commandsJson = readFlagValue(args, "--commands-json");
  if (!commandsJson) return TEST_DOCS_COMMANDS;
  const raw = await readFile(commandsJson, "utf8");
  const commands = JSON.parse(raw);
  if (!Array.isArray(commands) || commands.some((command) => typeof command !== "string")) {
    throw new Error("--commands-json must contain a JSON array of command strings");
  }
  return commands;
}

async function runFailFast(commands, repoRoot) {
  for (const command of commands) {
    const result = await runCommand(command, { cwd: repoRoot, stream: true });
    if (result.status !== 0 || result.signal) {
      process.exit(result.status ?? 1);
    }
  }
}

async function runReportAll(commands, repoRoot, reportFile) {
  const expandedCommands = await expandCommands(commands, repoRoot, { expandNpmScripts: true });
  const failures = [];
  const ts = new Date().toISOString();

  for (const command of expandedCommands) {
    console.log(`[test:docs report-all] ${command}`);
    const result = await runCommand(command, { cwd: repoRoot, stream: false });
    if (result.status === 0 && !result.signal) continue;

    const target = commandTarget(command);
    failures.push({
      guard: guardName(command, target),
      target,
      signature: failureSignature({ command, repoRoot, ...result }),
      ts
    });
  }

  await writeFile(reportFile, `${JSON.stringify(failures, null, 2)}\n`);
  console.log(`[test:docs report-all] wrote ${reportFile} with ${failures.length} failure(s)`);
}

async function main() {
  const args = process.argv.slice(2);
  const reportAll = args.includes("--report-all");
  const repoRoot = path.resolve(readFlagValue(args, "--repo-root") ?? ".");
  const reportFile = path.resolve(repoRoot, readFlagValue(args, "--report-file") ?? DEFAULT_REPORT_FILE);
  const commands = await loadCommands(args);

  if (reportAll) {
    await runReportAll(commands, repoRoot, reportFile);
    return;
  }

  await runFailFast(commands, repoRoot);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.stack ?? error.message);
    process.exit(1);
  });
}
