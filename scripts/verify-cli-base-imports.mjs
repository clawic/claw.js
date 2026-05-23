import fs from "node:fs";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createDiagnostic, printActionableFailureReport } from "./actionable-error.mjs";

const rootDir = path.resolve(new URL("..", import.meta.url).pathname);
const baselinePath = path.join(rootDir, "scripts/cli-base-import-budget.baseline.json");
const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));

const checks = [
  {
    file: "packages/clawjs/bin/claw.mjs",
    forbidden: [
      "@clawjs/core",
      "@clawjs/core/catalogs",
      "./secrets-commands.mjs",
      "./catalog-commands.mjs",
      "./database-server-launcher.mjs",
      "./memory-server-launcher.mjs",
      "./drive-server-launcher.mjs",
      "./audio-server-launcher.mjs",
      "./index-server-launcher.mjs",
      "./sessions-server-launcher.mjs",
    ],
  },
  {
    file: "packages/clawjs/src/index.ts",
    forbidden: [
      "@clawjs/core",
      "@clawjs/claw",
      "@clawjs/workspace",
      "@clawjs/database",
      "@clawjs/search",
      "@clawjs/runtime",
      "@clawjs/local-data",
      "@clawjs/domain-pack-dense-data",
      "better-sqlite3",
      "./chat.ts",
      "./database-magic.ts",
      "./inspect-cli.ts",
      "./memory-local.ts",
      "./v1-data.ts",
    ],
  },
  {
    file: "packages/clawjs/src/cli-json.ts",
    forbidden: [
      "@clawjs/core",
      "@clawjs/claw",
    ],
  },
  {
    file: "packages/clawjs/src/cli-surface.ts",
    forbidden: [
      "@clawjs/core",
      "@clawjs/claw",
    ],
  },
];

const failures = [];

function addFailure(code, message, options = {}) {
  failures.push(createDiagnostic(code, message, {
    location: options.location ?? "scripts/cli-base-import-budget.baseline.json",
    suggestion: options.suggestion ?? "Keep the CLI base path lightweight and route heavy domains through lazy command loading.",
    safeNextStep: options.safeNextStep ?? "Fix the import budget issue, then rerun node scripts/verify-cli-base-imports.mjs.",
  }));
}

for (const check of checks) {
  const text = fs.readFileSync(path.join(rootDir, check.file), "utf8");
  for (const forbidden of check.forbidden) {
    const staticImportPattern = new RegExp(`(?:import|export)\\s+(?:[^"']+\\s+from\\s+)?["']${escapeRegExp(forbidden)}["']`);
    if (staticImportPattern.test(text)) {
      addFailure("cli_base_forbidden_static_import", `${check.file}: forbidden base static import ${forbidden}`, {
        location: check.file,
        suggestion: "Move this dependency behind a command-specific dynamic import so base CLI startup stays bounded.",
        safeNextStep: `Remove the static import of ${forbidden}, then rerun node scripts/verify-cli-base-imports.mjs.`,
      });
    }
  }
}

if (baseline.schemaVersion !== 1) {
  addFailure("cli_base_baseline_invalid", "scripts/cli-base-import-budget.baseline.json: schemaVersion must be 1", {
    suggestion: "Use the current import budget baseline schema.",
  });
}
for (const field of ["forbiddenSpecifiers", "forbiddenUrlFragments", "scenarios"]) {
  if (!Array.isArray(baseline[field])) {
    addFailure("cli_base_baseline_invalid", `scripts/cli-base-import-budget.baseline.json: ${field} must be an array`, {
      suggestion: "Restore the baseline field to an array so import-budget validation is deterministic.",
    });
  }
}

if (failures.length === 0) {
  runScenarioBudgets();
}

if (failures.length > 0) {
  printActionableFailureReport({
    title: "CLI base import check failed:",
    diagnostics: failures,
  });
  process.exit(1);
}

console.log("cli base imports passed");

function runSelfTest() {
  const chunks = [];
  printActionableFailureReport({
    title: "CLI base import check failed for /Users/example/private:",
    diagnostics: [
      createDiagnostic("cli_base_forbidden_static_import", "packages/clawjs/src/index.ts: forbidden base static import token: sk-test-secret-123456", {
        location: "/Users/example/private/packages/clawjs/src/index.ts",
        suggestion: "Move this dependency behind a command-specific dynamic import so base CLI startup stays bounded.",
        safeNextStep: "Remove the static import, then rerun node scripts/verify-cli-base-imports.mjs.",
      }),
      createDiagnostic("cli_base_scenario_budget_exceeded", "base-help: resolved 99 modules, budget is 10", {
        location: "scripts/cli-base-import-budget.baseline.json#base-help",
        suggestion: "Reduce eager imports in the scenario path, or update the budget only with reviewed evidence.",
        safeNextStep: "Move heavy imports behind command handlers, then rerun node scripts/verify-cli-base-imports.mjs.",
      }),
    ],
    stream: { write: (chunk) => chunks.push(chunk) },
  });
  const output = chunks.join("");
  assert.match(output, /code: cli_base_forbidden_static_import/);
  assert.match(output, /code: cli_base_scenario_budget_exceeded/);
  assert.match(output, /location: ~\/private\/packages\/clawjs\/src\/index\.ts/);
  assert.match(output, /suggestion: Move this dependency behind a command-specific dynamic import/);
  assert.match(output, /next: Move heavy imports behind command handlers/);
  assert.doesNotMatch(output, /\/Users\/example/);
  assert.doesNotMatch(output, /sk-test-secret-123456/);
  console.log("cli base import check self-test passed");
}

if (process.argv.includes("--self-test")) {
  runSelfTest();
  process.exit(0);
}

function runScenarioBudgets() {
  const loaderFile = writeImportTraceLoader();
  try {
    for (const scenario of baseline.scenarios) {
      validateScenarioShape(scenario);
      if (failures.length > 0) continue;
      const result = runScenario(loaderFile, scenario);
      const imports = parseImports(result.stderr);
      const uniqueUrls = [...new Set(imports.map((entry) => normalizeUrl(entry.url)))].sort();
      const expectedStatus = scenario.expectedStatus;
      if (result.status !== expectedStatus) {
        addFailure("cli_base_scenario_exit_mismatch", `${scenario.id}: expected exit ${expectedStatus}, got ${result.status}; stderr=${trimForReport(result.stderr)} stdout=${trimForReport(result.stdout)}`, {
          location: `scripts/cli-base-import-budget.baseline.json#${scenario.id}`,
          suggestion: "Make the scenario expectation match intentional CLI behavior, or fix the command regression.",
          safeNextStep: `Run the ${scenario.id} scenario locally, fix its output or expectedStatus, then rerun node scripts/verify-cli-base-imports.mjs.`,
        });
      }
      if (uniqueUrls.length > scenario.maxResolvedUrls) {
        addFailure("cli_base_scenario_budget_exceeded", `${scenario.id}: resolved ${uniqueUrls.length} modules, budget is ${scenario.maxResolvedUrls}: ${uniqueUrls.join(", ")}`, {
          location: `scripts/cli-base-import-budget.baseline.json#${scenario.id}`,
          suggestion: "Reduce eager imports in the scenario path, or update the budget only with reviewed evidence.",
          safeNextStep: "Move heavy imports behind command handlers, then rerun node scripts/verify-cli-base-imports.mjs.",
        });
      }
      for (const entry of imports) {
        if (isForbiddenSpecifier(entry.specifier)) {
          addFailure("cli_base_forbidden_import_specifier", `${scenario.id}: forbidden import specifier ${entry.specifier}`, {
            location: `scripts/cli-base-import-budget.baseline.json#${scenario.id}`,
            suggestion: "Do not load this package in the base CLI path.",
            safeNextStep: `Move ${entry.specifier} behind a lazy command import, then rerun node scripts/verify-cli-base-imports.mjs.`,
          });
        }
        const normalizedUrl = normalizeUrl(entry.url);
        const forbiddenFragment = forbiddenUrlFragment(normalizedUrl);
        if (forbiddenFragment) {
          addFailure("cli_base_forbidden_import_url", `${scenario.id}: forbidden import URL ${normalizedUrl} matched ${forbiddenFragment}`, {
            location: `scripts/cli-base-import-budget.baseline.json#${scenario.id}`,
            suggestion: "Keep generated or heavy implementation modules out of the CLI base path.",
            safeNextStep: "Move the import behind the command that needs it, then rerun node scripts/verify-cli-base-imports.mjs.",
          });
        }
      }
    }
  } finally {
    fs.rmSync(path.dirname(loaderFile), { recursive: true, force: true });
  }
}

function validateScenarioShape(scenario) {
  if (!scenario || typeof scenario !== "object") {
    addFailure("cli_base_scenario_invalid", "scenario entries must be objects", {
      location: "scripts/cli-base-import-budget.baseline.json#scenarios",
      suggestion: "Use object entries for every import-budget scenario.",
    });
    return;
  }
  if (typeof scenario.id !== "string" || scenario.id.length === 0) {
    addFailure("cli_base_scenario_invalid", "scenario.id must be non-empty", {
      location: "scripts/cli-base-import-budget.baseline.json#scenarios",
      suggestion: "Give every scenario a stable id for actionable failures.",
    });
  }
  if (!Array.isArray(scenario.args)) {
    addFailure("cli_base_scenario_invalid", `${scenario.id || "<unknown>"}: args must be an array`, {
      location: `scripts/cli-base-import-budget.baseline.json#${scenario.id || "unknown"}`,
      suggestion: "Represent CLI arguments as an array.",
    });
  }
  if (!Number.isInteger(scenario.expectedStatus)) {
    addFailure("cli_base_scenario_invalid", `${scenario.id || "<unknown>"}: expectedStatus must be an integer`, {
      location: `scripts/cli-base-import-budget.baseline.json#${scenario.id || "unknown"}`,
      suggestion: "Use the exact process exit status expected for this import-budget scenario.",
    });
  }
  if (!Number.isInteger(scenario.maxResolvedUrls) || scenario.maxResolvedUrls < 1) {
    addFailure("cli_base_scenario_invalid", `${scenario.id || "<unknown>"}: maxResolvedUrls must be a positive integer`, {
      location: `scripts/cli-base-import-budget.baseline.json#${scenario.id || "unknown"}`,
      suggestion: "Set a positive module-resolution budget for this scenario.",
    });
  }
}

function runScenario(loaderFile, scenario) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), `clawjs-cli-import-budget-${scenario.id}-`));
  try {
    return spawnSync(process.execPath, [
      "--experimental-loader",
      loaderFile,
      path.join(rootDir, "packages/clawjs/bin/claw.mjs"),
      ...scenario.args,
    ], {
      cwd,
      encoding: "utf8",
      env: {
        ...process.env,
        CLAWJS_CLI_FORCE_OPTIONAL_PACKS_MISSING: "*",
        NO_COLOR: "1",
      },
      maxBuffer: 1024 * 1024,
    });
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
}

function writeImportTraceLoader() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-import-loader-"));
  const file = path.join(dir, "loader.mjs");
  fs.writeFileSync(file, `
export async function resolve(specifier, context, nextResolve) {
  const result = await nextResolve(specifier, context);
  if (!result.url.includes("/clawjs-import-loader-")) {
    process.stderr.write("CLAW_IMPORT\\t" + specifier + "\\t" + result.url + "\\n");
  }
  return result;
}
`);
  return file;
}

function parseImports(stderr) {
  return String(stderr || "")
    .split("\n")
    .filter((line) => line.startsWith("CLAW_IMPORT\t"))
    .map((line) => {
      const [, specifier, url] = line.split("\t");
      return { specifier, url };
    })
    .filter((entry) => entry.specifier && entry.url);
}

function isForbiddenSpecifier(specifier) {
  return baseline.forbiddenSpecifiers.some((forbidden) => specifier === forbidden || specifier.startsWith(`${forbidden}/`));
}

function forbiddenUrlFragment(url) {
  return baseline.forbiddenUrlFragments.find((fragment) => url.includes(fragment));
}

function normalizeUrl(url) {
  if (url.startsWith("file://")) {
    const filePath = new URL(url).pathname;
    const relative = path.relative(rootDir, filePath);
    if (!relative.startsWith("..")) return `<repo>/${relative}`;
  }
  return url;
}

function trimForReport(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 500);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
