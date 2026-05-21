import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

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

for (const check of checks) {
  const text = fs.readFileSync(path.join(rootDir, check.file), "utf8");
  for (const forbidden of check.forbidden) {
    const staticImportPattern = new RegExp(`(?:import|export)\\s+(?:[^"']+\\s+from\\s+)?["']${escapeRegExp(forbidden)}["']`);
    if (staticImportPattern.test(text)) {
      failures.push(`${check.file}: forbidden base static import ${forbidden}`);
    }
  }
}

if (baseline.schemaVersion !== 1) {
  failures.push("scripts/cli-base-import-budget.baseline.json: schemaVersion must be 1");
}
for (const field of ["forbiddenSpecifiers", "forbiddenUrlFragments", "scenarios"]) {
  if (!Array.isArray(baseline[field])) failures.push(`scripts/cli-base-import-budget.baseline.json: ${field} must be an array`);
}

if (failures.length === 0) {
  runScenarioBudgets();
}

if (failures.length > 0) {
  console.error("CLI base import check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("cli base imports passed");

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
        failures.push(`${scenario.id}: expected exit ${expectedStatus}, got ${result.status}; stderr=${trimForReport(result.stderr)} stdout=${trimForReport(result.stdout)}`);
      }
      if (uniqueUrls.length > scenario.maxResolvedUrls) {
        failures.push(`${scenario.id}: resolved ${uniqueUrls.length} modules, budget is ${scenario.maxResolvedUrls}: ${uniqueUrls.join(", ")}`);
      }
      for (const entry of imports) {
        if (isForbiddenSpecifier(entry.specifier)) {
          failures.push(`${scenario.id}: forbidden import specifier ${entry.specifier}`);
        }
        const normalizedUrl = normalizeUrl(entry.url);
        const forbiddenFragment = forbiddenUrlFragment(normalizedUrl);
        if (forbiddenFragment) {
          failures.push(`${scenario.id}: forbidden import URL ${normalizedUrl} matched ${forbiddenFragment}`);
        }
      }
    }
  } finally {
    fs.rmSync(path.dirname(loaderFile), { recursive: true, force: true });
  }
}

function validateScenarioShape(scenario) {
  if (!scenario || typeof scenario !== "object") {
    failures.push("scenario entries must be objects");
    return;
  }
  if (typeof scenario.id !== "string" || scenario.id.length === 0) failures.push("scenario.id must be non-empty");
  if (!Array.isArray(scenario.args)) failures.push(`${scenario.id || "<unknown>"}: args must be an array`);
  if (!Number.isInteger(scenario.expectedStatus)) failures.push(`${scenario.id || "<unknown>"}: expectedStatus must be an integer`);
  if (!Number.isInteger(scenario.maxResolvedUrls) || scenario.maxResolvedUrls < 1) failures.push(`${scenario.id || "<unknown>"}: maxResolvedUrls must be a positive integer`);
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
