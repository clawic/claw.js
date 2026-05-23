#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createDiagnostic, printActionableFailureReport } from "./actionable-error.mjs";

const rootDir = path.resolve(new URL("..", import.meta.url).pathname);
const files = ["AGENTS.md", "CLAUDE.md", "docs/agent-rules/index.md"];
const budgets = {
  "AGENTS.md": 120,
  "CLAUDE.md": 20,
};

function instructionDiagnostic(error) {
  if (error.startsWith("unknown argument")) {
    return createDiagnostic("agent_instructions_usage_error", error, {
      status: "USAGE",
      location: "scripts/agent-instructions-check.mjs",
      suggestion: "Use --self-test or no arguments.",
      safeNextStep: "Rerun node scripts/agent-instructions-check.mjs with supported arguments.",
    });
  }
  const missing = error.match(/^missing (.+)$/);
  if (missing) {
    return createDiagnostic("agent_instructions_required_file_missing", error, {
      location: missing[1],
      suggestion: "Restore the required agent instruction file or route shim.",
      safeNextStep: `Add or restore ${missing[1]}, then rerun node scripts/agent-instructions-check.mjs.`,
    });
  }
  return createDiagnostic("agent_instructions_check_failed", error, {
    location: "scripts/agent-instructions-check.mjs",
    suggestion: "Inspect the agent instruction invariant and restore the expected file.",
    safeNextStep: "Fix the reported agent instruction issue, then rerun node scripts/agent-instructions-check.mjs.",
  });
}

function printErrors(errors, options = {}) {
  printActionableFailureReport({
    title: options.title ?? "agent instructions check failed:",
    diagnostics: errors.map(instructionDiagnostic),
    stream: options.stream ?? process.stderr,
  });
}

function runSelfTest() {
  const chunks = [];
  printErrors([
    "missing /Users/example/private/AGENTS.md",
    "unknown argument --bad-token-sk-test-secret-123456",
  ], { stream: { write: (chunk) => chunks.push(chunk) } });
  const output = chunks.join("");
  if (!output.includes("code: agent_instructions_required_file_missing")) throw new Error("self-test missing required-file code");
  if (!output.includes("code: agent_instructions_usage_error")) throw new Error("self-test missing usage code");
  if (!output.includes("suggestion: Restore the required agent instruction file")) throw new Error("self-test missing suggestion");
  if (output.includes("/Users/example") || output.includes("sk-test-secret-123456")) throw new Error("self-test leaked private data");
}

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function lineCount(text) {
  return text.replace(/\n$/u, "").split(/\r?\n/u).length;
}

function normalizeLine(line) {
  return line.trim().replace(/\s+/gu, " ");
}

function longListSignals(relativePath, text) {
  const signals = [];
  let currentHeading = "top";
  let bulletRun = 0;
  const flush = () => {
    if (bulletRun >= 8) signals.push(`${relativePath}: ${currentHeading} has ${bulletRun} consecutive list items`);
    bulletRun = 0;
  };
  for (const line of text.split(/\r?\n/u)) {
    const heading = line.match(/^#{1,3}\s+(.+)$/u);
    if (heading) {
      flush();
      currentHeading = heading[1];
      continue;
    }
    if (/^\s*[-*]\s+/u.test(line) || /^\s*\d+\.\s+/u.test(line)) bulletRun += 1;
    else if (line.trim() !== "") flush();
  }
  flush();
  return signals;
}

function duplicatedInstructionLines(contents) {
  const seen = new Map();
  for (const [relativePath, text] of Object.entries(contents)) {
    for (const line of text.split(/\r?\n/u)) {
      const normalized = normalizeLine(line);
      if (normalized.length < 48) continue;
      if (!/[A-Za-z]/u.test(normalized)) continue;
      if (!seen.has(normalized)) seen.set(normalized, new Set());
      seen.get(normalized).add(relativePath);
    }
  }
  return [...seen.entries()]
    .filter(([, paths]) => paths.size > 1)
    .map(([line, paths]) => `${[...paths].sort().join(", ")} duplicate: ${line}`);
}

for (const arg of process.argv.slice(2)) {
  if (arg === "--self-test") {
    runSelfTest();
    console.log("agent instructions check self-test passed");
    process.exit(0);
  }
  printErrors([`unknown argument ${arg}`]);
  process.exit(64);
}

const errors = [];
const contents = {};
for (const relativePath of files) {
  const absolutePath = path.join(rootDir, relativePath);
  if (!fs.existsSync(absolutePath)) {
    errors.push(`missing ${relativePath}`);
    continue;
  }
  contents[relativePath] = read(relativePath);
}

if (errors.length > 0) {
  printErrors(errors);
  process.exit(1);
}

const warnings = [];
for (const [relativePath, budget] of Object.entries(budgets)) {
  const count = lineCount(contents[relativePath]);
  if (count > budget) warnings.push(`${relativePath}: ${count} lines exceeds report-only target ${budget}`);
}

for (const relativePath of ["AGENTS.md", "CLAUDE.md"]) {
  if (!contents[relativePath].includes("docs/agent-rules/index.md")) {
    warnings.push(`${relativePath}: missing docs/agent-rules/index.md route`);
  }
}

warnings.push(...longListSignals("AGENTS.md", contents["AGENTS.md"]));
warnings.push(...longListSignals("CLAUDE.md", contents["CLAUDE.md"]));
warnings.push(...duplicatedInstructionLines(contents).slice(0, 20));

if (warnings.length > 0) {
  console.error("agent instructions report-only warnings:");
  for (const warning of warnings) console.error(`- ${warning}`);
} else {
  console.error("agent instructions check passed with no report-only warnings");
}

process.exit(0);
