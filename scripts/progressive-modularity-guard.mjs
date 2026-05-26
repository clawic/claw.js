import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createDiagnostic, printActionableFailureReport } from "./actionable-error.mjs";

const rootDir = path.resolve(new URL("..", import.meta.url).pathname);
const args = new Set(process.argv.slice(2));
const allowedArgs = new Set(["--self-test"]);
const errors = [];

function modularityDiagnostic(error) {
  if (error.startsWith("unknown argument")) {
    return createDiagnostic("progressive_modularity_usage_error", error, {
      status: "USAGE",
      location: "scripts/progressive-modularity-guard.mjs",
      suggestion: "Use --self-test or no arguments.",
      safeNextStep: "Rerun node scripts/progressive-modularity-guard.mjs with a supported argument.",
    });
  }
  if (error.includes("must not define") && error.includes("install must stay zero-surprise")) {
    return createDiagnostic("progressive_modularity_install_hook_forbidden", error, {
      location: "packages/clawjs/package.json",
      suggestion: "Remove install-time hooks from the base CLI package so installs remain zero-surprise.",
      safeNextStep: "Delete the named lifecycle script, then rerun node scripts/progressive-modularity-guard.mjs.",
    });
  }
  if (error.includes("must not depend directly on optional heavy dependency")) {
    return createDiagnostic("progressive_modularity_heavy_dependency_direct", error, {
      location: error.startsWith("package-lock") ? "package-lock.json" : "packages/clawjs/package.json",
      suggestion: "Move optional or heavy functionality behind an explicit capability pack or dynamic import.",
      safeNextStep: "Remove the direct dependency from the base CLI package, refresh the lockfile if needed, then rerun this guard.",
    });
  }
  if (error.includes("must load") && error.includes("on demand")) {
    return createDiagnostic("progressive_modularity_optional_import_eager", error, {
      location: "packages/clawjs/src/index.ts",
      suggestion: "Use an on-demand dynamic import for optional command packs instead of a top-level import.",
      safeNextStep: "Move the optional import behind the command path, then rerun node scripts/progressive-modularity-guard.mjs.",
    });
  }
  const missingFile = error.match(/^(.+) is missing$/);
  if (missingFile) {
    return createDiagnostic("progressive_modularity_required_file_missing", error, {
      location: missingFile[1],
      suggestion: "Restore the required doc, package manifest, script, or test that anchors progressive modularity.",
      safeNextStep: `Add or restore ${missingFile[1]}, then rerun node scripts/progressive-modularity-guard.mjs.`,
    });
  }
  const missingSnippet = error.match(/^(.+) must mention (.+)$/);
  if (missingSnippet) {
    return createDiagnostic("progressive_modularity_required_snippet_missing", error, {
      location: missingSnippet[1],
      suggestion: "Update the named source or docs file so the progressive modularity contract stays discoverable.",
      safeNextStep: "Add the missing phrase or behavior marker, then rerun node scripts/progressive-modularity-guard.mjs.",
    });
  }
  if (error.startsWith("collections default visibility smoke failed")) {
    return createDiagnostic("progressive_modularity_visibility_smoke_failed", error, {
      location: "packages/clawjs/bin/claw.mjs",
      suggestion: "Fix the CLI setup/modules/collections visibility behavior shown by the nested smoke output.",
      safeNextStep: "Run the failing collections/setup command from the smoke check, fix the first failure, then rerun this guard.",
    });
  }
  return createDiagnostic("progressive_modularity_guard_failed", error, {
    location: "scripts/progressive-modularity-guard.mjs",
    suggestion: "Inspect the named progressive modularity invariant and restore the base CLI contract.",
    safeNextStep: "Fix the reported invariant, then rerun node scripts/progressive-modularity-guard.mjs.",
  });
}

function printErrors(items, options = {}) {
  printActionableFailureReport({
    title: options.title ?? "progressive modularity guard failed:",
    diagnostics: items.map(modularityDiagnostic),
    stream: options.stream ?? process.stderr,
  });
}

function runSelfTest() {
  const chunks = [];
  printErrors([
    "unknown argument --bad-token-sk-test-secret-123456",
    "@clawjs/cli must not define postinstall; install must stay zero-surprise",
    "@clawjs/cli must not depend directly on optional heavy dependency playwright",
    "package-lock packages/clawjs must not depend directly on optional heavy dependency playwright",
    "packages/clawjs/src/index.ts must load ./cli-dense-data-command.ts on demand, not as a top-level import",
    "/Users/example/private/AGENTS.md is missing",
    "docs/cli.md must mention claw setup",
    "collections default visibility smoke failed: token: sk-test-secret-123456",
  ], { stream: { write: (chunk) => chunks.push(chunk) } });
  const output = chunks.join("");
  for (const code of [
    "progressive_modularity_usage_error",
    "progressive_modularity_install_hook_forbidden",
    "progressive_modularity_heavy_dependency_direct",
    "progressive_modularity_optional_import_eager",
    "progressive_modularity_required_file_missing",
    "progressive_modularity_required_snippet_missing",
    "progressive_modularity_visibility_smoke_failed",
  ]) {
    if (!output.includes(`code: ${code}`)) throw new Error(`self-test missing ${code}`);
  }
  if (!output.includes("suggestion: Move optional or heavy functionality")) throw new Error("self-test missing actionable suggestion");
  if (output.includes("/Users/example") || output.includes("sk-test-secret-123456")) throw new Error("self-test leaked private data");
}

for (const arg of args) {
  if (!allowedArgs.has(arg)) {
    printErrors([`unknown argument ${arg}`]);
    process.exit(64);
  }
}

if (args.has("--self-test")) {
  runSelfTest();
  console.log("progressive modularity guard self-test passed");
  process.exit(0);
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(rootDir, relativePath), "utf8"));
}

function readText(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function requireText(relativePath, requiredSnippets) {
  const filePath = path.join(rootDir, relativePath);
  if (!fs.existsSync(filePath)) {
    errors.push(`${relativePath} is missing`);
    return;
  }
  const text = readText(relativePath);
  for (const snippet of requiredSnippets) {
    if (!text.includes(snippet)) {
      errors.push(`${relativePath} must mention ${snippet}`);
    }
  }
}

const cliPackage = readJson("packages/clawjs/package.json");
const cliScripts = cliPackage.scripts ?? {};
for (const hook of ["preinstall", "install", "postinstall", "prepare"]) {
  if (cliScripts[hook]) {
    errors.push(`@clawjs/cli must not define ${hook}; install must stay zero-surprise`);
  }
}

const heavyDirectDependencies = new Set([
  "better-sqlite3",
  "@clawjs/claw",
  "@clawjs/database",
  "@clawjs/search",
  "@clawjs/runtime",
  "@clawjs/signals",
  "@clawjs/workspace",
  "@clawjs/local-data",
  "@playwright/test",
  "playwright",
  "playwright-core",
  "puppeteer",
  "chromium",
  "@clawjs/agents",
  "@clawjs/audio",
  "@clawjs/integrations",
  "@clawjs/sessions",
  "@clawjs/domain-pack-dense-data",
  "@xenova/transformers",
  "onnxruntime-node",
]);
for (const dependency of Object.keys(cliPackage.dependencies ?? {})) {
  if (heavyDirectDependencies.has(dependency)) {
    errors.push(`@clawjs/cli must not depend directly on optional heavy dependency ${dependency}`);
  }
}

const lock = readJson("package-lock.json");
const cliLockDependencies = lock.packages?.["packages/clawjs"]?.dependencies ?? {};
for (const dependency of Object.keys(cliLockDependencies)) {
  if (heavyDirectDependencies.has(dependency)) {
    errors.push(`package-lock packages/clawjs must not depend directly on optional heavy dependency ${dependency}`);
  }
}

const cliIndexSource = readText("packages/clawjs/src/index.ts");
for (const optionalSource of ["./cli-dense-data-command.ts", "./cli-delegated-domains.ts"]) {
  if (cliIndexSource.includes(`from "${optionalSource}"`) || cliIndexSource.includes(`from '${optionalSource}'`)) {
    errors.push(`packages/clawjs/src/index.ts must load ${optionalSource} on demand, not as a top-level import`);
  }
}

requireText("CONSTITUTION.md", ["zero-surprise", "progressive", "modular"]);
requireText("docs/adr/0031-progressive-modularity-and-zero-surprise-install.md", [
  "zero-surprise",
  "capabilities",
  "areas",
  "minimal",
  "normal",
  "advanced",
  "available",
  "visible",
  "enabled",
  "configured",
  "running",
  "permissioned",
  "@clawjs/domain-pack-dense-data",
]);
requireText("docs/decision-map.md", ["progressive modularity", "scripts/progressive-modularity-guard.mjs"]);
requireText("docs/cli.md", ["claw setup", "claw setup --interactive", "claw modules", "Progressive Setup", "--details", "--enable id1,id2", "@clawjs/domain-pack-dense-data"]);
requireText("packages/clawjs/src/cli-modules-command.ts", ["ModuleKind = \"capability\" | \"area\"", "requiresExplicitInstall", "optionalPack", "@clawjs/local-data", "requiredModuleForCliGroup", "hasModuleConfigForCli", "runSetupCli", "runModulesCli"]);
requireText("packages/clawjs/bin/claw.mjs", ["@clawjs/local-data", "optional_pack_missing", "Start here"]);
requireText("packages/clawjs-local-data/package.json", ["@clawjs/local-data", "Optional local data capability pack"]);
requireText("packages/clawjs/src/cli-collections-command.ts", ["available", "activeCollectionFilterForModules", "visibility"]);
requireText("packages/clawjs/bin/claw.mjs", ["DATA_GROUPS", "RUNTIME_GROUPS", "optional_pack_missing", "Start here", "claw modules install"]);
requireText("packages/clawjs/src/index.ts", ["GENERATED_CLI_ROUTE_GROUPS", "runGeneratedCliRoute", "import(\"./cli-legacy.ts\")", "writePublicPortalHelpOnly"]);
requireText("packages/clawjs/src/index-installed.test.ts", ["base CLI dependency", "optional_pack_missing", "@clawjs/local-data"]);
requireText("scripts/cli-base-import-budget.baseline.json", ["tasks-missing-pack", "search-missing-pack", "dense-domain-disabled", "@clawjs/runtime"]);
requireText("scripts/verify-cli-base-imports.mjs", ["CLAWJS_CLI_FORCE_OPTIONAL_PACKS_MISSING", "maxResolvedUrls", "forbiddenSpecifiers"]);
requireText("packages/clawjs-domain-pack-dense-data/package.json", ["@clawjs/domain-pack-dense-data", "Optional dense domain command pack"]);
requireText("packages/clawjs-domain-pack-dense-data/src/index.ts", ["runProfessionalRecordsCli", "cli-dense-data-command.ts"]);
requireText("packages/clawjs/src/cli-modules-command.test.ts", ["setup preview", "setup details allow reviewing and adjusting modules before apply", "setup interactive asks for mode", "modules list hides available niche modules", "collections list shows active safe catalog", "niche domain commands require explicit module enablement", "safe first-use productivity commands accept claw-home"]);
requireText("packages/clawjs-core/src/cli-command-registry.ts", ["setup", "modules", "0031-progressive-modularity-and-zero-surprise-install"]);

const collectionVisibilityCheck = spawnSync(process.execPath, [
  "--import",
  "tsx",
  "--eval",
  `
    import fs from "node:fs";
    import os from "node:os";
    import path from "node:path";
    async function capture(argv, cwd) {
      const child = await import("node:child_process");
      const result = child.spawnSync(process.execPath, ["./packages/clawjs/bin/claw.mjs", ...argv], { cwd, encoding: "utf8" });
      return { code: result.status ?? 1, stdout: result.stdout, stderr: result.stderr };
    }

    const home = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-progressive-guard-"));
    try {
      const active = await capture(["collections", "list", "--claw-home", home, "--json"], process.cwd());
      if (active.code !== 0) throw new Error(active.stderr || active.stdout);
      const activePayload = JSON.parse(active.stdout);
      const activeNames = new Set(activePayload.data.collections.map((collection) => collection.name));
      const activeFamilies = new Set(activePayload.data.collections.map((collection) => collection.family));
      if (activePayload.data.visibility !== "active") throw new Error("collections list must default to active visibility");
      if (!activeNames.has("tasks")) throw new Error("collections list must keep safe tasks visible");
      for (const forbidden of ["patients", "legal_cases", "drug_products", "construction_projects"]) {
        if (activeNames.has(forbidden)) throw new Error("collections list exposes inactive niche collection " + forbidden);
      }
      for (const forbiddenFamily of ["health", "legal", "pharma", "construction"]) {
        if (activeFamilies.has(forbiddenFamily)) throw new Error("collections list exposes inactive niche family " + forbiddenFamily);
      }

      const available = await capture(["collections", "list", "--available", "--claw-home", home, "--json"], process.cwd());
      if (available.code !== 0) throw new Error(available.stderr || available.stdout);
      const availablePayload = JSON.parse(available.stdout);
      const availableNames = new Set(availablePayload.data.collections.map((collection) => collection.name));
      if (availablePayload.data.visibility !== "available") throw new Error("--available must expose available visibility");
      if (!availableNames.has("patients")) throw new Error("--available must expose full catalog entries");

      const detail = await capture(["setup", "normal", "--details", "--enable", "crm", "--disable", "light-search", "--claw-home", home, "--json"], process.cwd());
      if (detail.code !== 0) throw new Error(detail.stderr || detail.stdout);
      const detailPayload = JSON.parse(detail.stdout);
      if (detailPayload.data.applied !== false) throw new Error("setup details must preview without applying");
      if (!detailPayload.data.detail?.capability?.some((module) => module.id === "light-search")) throw new Error("setup details must show adjusted capabilities");
      if (!detailPayload.data.detail?.area?.some((module) => module.id === "erp")) throw new Error("setup details must show adjusted areas");
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  `,
], {
  cwd: rootDir,
  encoding: "utf8",
  maxBuffer: 1024 * 1024,
});
if (collectionVisibilityCheck.status !== 0) {
  errors.push(`collections default visibility smoke failed: ${collectionVisibilityCheck.stderr || collectionVisibilityCheck.stdout}`);
}

if (errors.length > 0) {
  printErrors(errors);
  process.exit(1);
}

console.log("progressive modularity guard passed");
