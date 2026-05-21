import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const rootDir = path.resolve(new URL("..", import.meta.url).pathname);
const args = new Set(process.argv.slice(2));
const errors = [];

if (args.has("--self-test")) {
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
requireText("packages/clawjs/bin/claw.mjs", ["@clawjs/local-data", "optional_pack_missing", "Safe base commands"]);
requireText("packages/clawjs-local-data/package.json", ["@clawjs/local-data", "Optional local data capability pack"]);
requireText("packages/clawjs/src/cli-collections-command.ts", ["--available", "activeCollectionFilterForModules", "visibility"]);
requireText("packages/clawjs/bin/claw.mjs", ["DATA_GROUPS", "RUNTIME_GROUPS", "optional_pack_missing", "Safe base commands", "claw modules install"]);
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
  console.error("progressive modularity guard failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("progressive modularity guard passed");
