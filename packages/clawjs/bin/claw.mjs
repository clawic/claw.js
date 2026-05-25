#!/usr/bin/env node

import path from "path";
import { fileURLToPath } from "node:url";

const invokedBinName = path.basename(process.argv[1] || "claw");
const publicBinName = invokedBinName === "claw.mjs" ? "claw" : invokedBinName;

const args = process.argv.slice(2);

// Bin-level shims stay lazy; the main CLI router is loaded only after command
// selection.
const first = args[0];
const second = args[1];

const DATA_GROUPS = new Set(["db", "records", "tasks", "task", "notes", "note", "projects", "project", "people", "person", "goals", "goal", "reminders", "reminder", "deadlines", "deadline", "work", "memory"]);
const LOCAL_DATA_LEGACY_GROUPS = new Set([
  ...DATA_GROUPS,
  "areas",
  "lists",
  "sections",
  "saved-views",
  "milestones",
  "recurrences",
  "cycles",
  "epics",
  "comments",
  "attachments",
  "custom-fields",
  "field-values",
  "events",
  "agenda",
  "timeline",
]);
const RUNTIME_GROUPS = new Set(["chat", "provider", "code", "runtime", "workspace"]);
const DENSE_GROUP_MODULES = new Map([["patient", "health"], ["patients", "health"], ["health", "health"], ["legal", "legal"], ["erp", "erp"], ["iot", "iot"], ["construction", "construction"], ["labs", "labs-pharma"], ["lab", "labs-pharma"], ["pharma", "labs-pharma"]]);
const DIRECT_ROUTER_GROUPS = new Set(["agent-resource", "test"]);
const DATABASE_ACTIONS = new Set(["list", "get", "create", "update", "delete", "schema", "query"]);

function wantsJson() {
  return args.includes("--json");
}

function writeJsonError(canonicalCommand, code, message, meta = {}) {
  console.log(JSON.stringify({ ok: false, error: { code, message }, meta: { schemaVersion: 1, canonicalCommand, ...meta } }, null, 2));
}

function writeJsonOk(canonicalCommand, data, meta = {}) {
  console.log(JSON.stringify({ ok: true, data, meta: { schemaVersion: 1, canonicalCommand, ...meta } }, null, 2));
}

async function hasPackage(packageName) {
  const forcedMissing = new Set((process.env.CLAWJS_CLI_FORCE_OPTIONAL_PACKS_MISSING || "").split(/[\s,]+/).filter(Boolean));
  if (forcedMissing.has("*") || forcedMissing.has(packageName)) return false;
  try {
    await import(packageName);
    return true;
  } catch (error) {
    const code = error?.code;
    if (code === "ERR_MODULE_NOT_FOUND" || code === "MODULE_NOT_FOUND") return false;
    throw error;
  }
}

function isMissingImport(error, specifier) {
  const code = error?.code;
  if (code !== "ERR_MODULE_NOT_FOUND" && code !== "MODULE_NOT_FOUND") return false;
  const message = String(error?.message ?? "");
  return message.includes(specifier) || message.includes(specifier.replace(/^@clawjs\/core\/compact-catalogs$/, "@clawjs/core/dist/compact-catalogs.js"));
}

async function importCoreCompactCatalogs() {
  try {
    return await import("@clawjs/core/compact-catalogs");
  } catch (error) {
    if (!isMissingImport(error, "@clawjs/core/compact-catalogs")) throw error;
    return import(new URL("../../clawjs-core/src/compact-catalogs.ts", import.meta.url));
  }
}

async function importCliRouter() {
  const sourceEntry = new URL("../src/index.ts", import.meta.url);
  try {
    return await import(sourceEntry);
  } catch (error) {
    const code = error?.code;
    if (code !== "ERR_MODULE_NOT_FOUND" && code !== "MODULE_NOT_FOUND" && code !== "ERR_UNKNOWN_FILE_EXTENSION") throw error;
  }
  const distEntry = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist/index.js");
  try {
    return await import(distEntry);
  } catch (error) {
    if (!isMissingImport(error, distEntry)) throw error;
    return import(new URL("../src/index.ts", import.meta.url));
  }
}

async function importGeneratedCliRouter() {
  const sourceEntry = new URL("../src/cli-router.generated.ts", import.meta.url);
  try {
    return await import(sourceEntry);
  } catch (error) {
    const code = error?.code;
    if (code !== "ERR_MODULE_NOT_FOUND" && code !== "MODULE_NOT_FOUND" && code !== "ERR_UNKNOWN_FILE_EXTENSION") throw error;
  }
  const distEntry = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist/cli-router.generated.js");
  try {
    return await import(distEntry);
  } catch (error) {
    if (!isMissingImport(error, distEntry)) throw error;
    return import(new URL("../src/cli-router.generated.ts", import.meta.url));
  }
}

function missingPack(canonicalCommand, moduleId, optionalPack) {
  const message = `This command needs optional pack ${optionalPack}. Review it with \`claw modules install ${moduleId}\` and install the pack explicitly before using this capability.`;
  if (wantsJson()) writeJsonError(canonicalCommand, "optional_pack_missing", message, { requiredModule: moduleId, optionalPack });
  else console.error(message);
  process.exit(64);
}

function moduleDefinitions() {
  return [
    { id: "local-data", kind: "capability", state: "available", label: "Local data", optionalPack: "@clawjs/local-data" },
    { id: "light-search", kind: "capability", state: "available", label: "Light search", optionalPack: "@clawjs/search" },
    { id: "dev-diagnostics", kind: "capability", state: "available", label: "Developer diagnostics", optionalPack: "@clawjs/claw @clawjs/workspace" },
    { id: "signals", kind: "capability", state: "available", label: "Signals", optionalPack: "@clawjs/signals" },
    { id: "basic-productivity", kind: "area", state: "available", label: "Basic productivity", optionalPack: "@clawjs/local-data" },
    { id: "erp", kind: "area", state: "available", label: "ERP", optionalPack: "@clawjs/domain-pack-dense-data" },
    { id: "health", kind: "area", state: "available", label: "Health", optionalPack: "@clawjs/domain-pack-dense-data" },
    { id: "legal", kind: "area", state: "available", label: "Legal", optionalPack: "@clawjs/domain-pack-dense-data" },
    { id: "labs-pharma", kind: "area", state: "available", label: "Labs and pharma", optionalPack: "@clawjs/domain-pack-dense-data" },
    { id: "construction", kind: "area", state: "available", label: "Construction", optionalPack: "@clawjs/domain-pack-dense-data" },
    { id: "iot", kind: "area", state: "available", label: "IoT", optionalPack: "@clawjs/domain-pack-dense-data" },
  ];
}

async function readWorkspaceModules() {
  const fs = await import("node:fs");
  const filePath = path.join(process.cwd(), ".claw", "config", "modules.json");
  if (!fs.existsSync(filePath)) return { schemaVersion: 1, mode: "minimal", enabledModules: [], disabledModules: [], updatedAt: new Date().toISOString() };
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return { schemaVersion: 1, mode: "minimal", enabledModules: [], disabledModules: [], updatedAt: new Date().toISOString() };
  }
}

async function writeWorkspaceModules(config) {
  const fs = await import("node:fs");
  const configDir = path.join(process.cwd(), ".claw", "config");
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(path.join(configDir, "modules.json"), `${JSON.stringify({ ...config, updatedAt: new Date().toISOString() }, null, 2)}\n`);
}

function baseUsage() {
  return [
    "Usage: claw <command> [options]",
    "",
    "Safe base commands:",
    "  claw modules list|status|install <module-id>",
    "  claw setup [minimal|normal|advanced] [--details]",
    "  claw inspect commands --json",
  ].join("\n");
}

async function runCliRouterAndExit() {
  let runCli;
  try {
    ({ runCli } = await importCliRouter());
  } catch {
    return false;
  }

  const exitCode = await runCli(args, {
    stdout: process.stdout,
    stderr: process.stderr,
    stdin: process.stdin,
    cwd: process.cwd(),
    binName: publicBinName,
  });

  process.exitCode = exitCode;
  await new Promise((resolve) => process.stdout.write("", resolve));
  await new Promise((resolve) => process.stderr.write("", resolve));
  process.exit();
}

const wantsHelpFlag = args.includes("--help") || args.includes("-h");
const rootHelp = !first || first === "help" || first === "--help" || first === "-h";
if ((rootHelp && wantsJson()) || (first === "help" && second) || (wantsHelpFlag && !(rootHelp && !args.includes("--all"))) || (first === "help" && args.includes("--all")) || args.includes("--version") || args.includes("-v")) {
  if (await runCliRouterAndExit()) {
    process.exit();
  }
}
if (rootHelp && !args.includes("--all")) {
  console.log(baseUsage());
  process.exit(0);
}
if (first === "inspect" && (second === "commands" || second === "cli")) {
  const { GENERATED_CLI_ROUTE_GROUPS } = await importGeneratedCliRouter();
  const commands = Object.keys(GENERATED_CLI_ROUTE_GROUPS).map((command) => ({ id: `claw.cli.command.${command}`, value: command }));
  if (wantsJson()) writeJsonOk("inspect", commands, { subcommand: second });
  else console.log(commands.map((entry) => entry.value).join("\n"));
  process.exit(0);
}
if (
  first === "setup" ||
  first === "modules" ||
  (first === "collections" && (!second || second === "list"))
) {
  if (await runCliRouterAndExit()) {
    process.exit();
  }
}
if (first === "modules") {
  const command = second ?? "list";
  const modules = moduleDefinitions();
  if (command === "list" || command === "status") {
    if (wantsJson()) writeJsonOk("modules", { mode: "minimal", modules }, { subcommand: command });
    else console.log(modules.map((module) => `${module.id}\t${module.kind}\t${module.state}\t${module.label}`).join("\n"));
    process.exit(0);
  }
  if (command === "install") {
    const module = modules.find((entry) => entry.id === args[2]);
    if (!module) {
      if (wantsJson()) writeJsonError("modules", "unknown_module", "Usage: claw modules install <module-id>");
      else console.error("Usage: claw modules install <module-id>");
      process.exit(64);
    }
    const installCommand = module.optionalPack ? `npm install ${module.optionalPack}` : null;
    const message = module.optionalPack ? `Module ${module.id} uses optional pack ${module.optionalPack}. Install it explicitly with \`${installCommand}\`, then enable the module.` : `Module ${module.id} has no automatic installer.`;
    if (wantsJson()) writeJsonOk("modules", { installed: false, module, optionalPack: module.optionalPack, installCommand, message, next: [installCommand, `claw modules enable ${module.id}`].filter(Boolean) }, { subcommand: "install" });
    else console.log(message);
    process.exit(0);
  }
  if (command === "enable" || command === "disable") {
    const module = modules.find((entry) => entry.id === args[2]);
    if (!module) {
      if (wantsJson()) writeJsonError("modules", "unknown_module", "Usage: claw modules enable|disable <module-id>");
      else console.error("Usage: claw modules enable|disable <module-id>");
      process.exit(64);
    }
    const config = await readWorkspaceModules();
    const enabled = new Set(config.enabledModules ?? []);
    const disabled = new Set(config.disabledModules ?? []);
    if (command === "enable") {
      enabled.add(module.id);
      disabled.delete(module.id);
    } else {
      disabled.add(module.id);
      enabled.delete(module.id);
    }
    await writeWorkspaceModules({ ...config, enabledModules: [...enabled].sort(), disabledModules: [...disabled].sort() });
    if (wantsJson()) writeJsonOk("modules", { scope: "workspace", moduleId: module.id, state: command === "enable" ? "enabled" : "available" }, { subcommand: command });
    else console.log(`${command === "enable" ? "enabled" : "disabled"} ${module.id}`);
    process.exit(0);
  }
}
if (first === "setup") {
  const mode = ["minimal", "normal", "advanced"].includes(second) ? second : "minimal";
  const modules = moduleDefinitions();
  if (wantsJson()) writeJsonOk("setup", { applied: false, mode, scope: "global", detail: { capability: modules.filter((module) => module.kind === "capability"), area: modules.filter((module) => module.kind === "area") }, modules }, { subcommand: "preview" });
  else console.log(`Mode preview: ${mode}\n\nRequires explicit action:\n${modules.map((module) => `  ${module.id.padEnd(18)} ${module.optionalPack ?? "manual"}`).join("\n")}`);
  process.exit(0);
}
if (first === "collections" && (!second || second === "list")) {
  const includeAvailable = args.includes("--available") || args.includes("--all");
  const collections = [
    { name: "tasks", displayName: "Tasks", family: "productivity", state: "enabled", moduleId: null, aliases: ["task"], fieldCount: 0 },
    ...(includeAvailable ? [
      { name: "patients", displayName: "Patients", family: "health", state: "available", moduleId: null, aliases: [], fieldCount: 0 },
    ] : []),
  ];
  if (wantsJson()) writeJsonOk("collections", { collections, total: collections.length, returned: collections.length, visibility: includeAvailable ? "available" : "active" }, { invokedCommand: "collections", subcommand: "list" });
  else console.log(collections.map((collection) => `${collection.name}\t${collection.family}\t${collection.state}`).join("\n"));
  process.exit(0);
}
if ((first === "collections" && second && second !== "list") || first === "records" || LOCAL_DATA_LEGACY_GROUPS.has(first)) {
  if (!(await hasPackage("@clawjs/local-data"))) missingPack(first === "db" ? "database" : first, "local-data", "@clawjs/local-data");
}
if (first === "search" && !(await hasPackage("@clawjs/search"))) missingPack("search", "light-search", "@clawjs/search");
if (RUNTIME_GROUPS.has(first) && !(await hasPackage("@clawjs/claw"))) missingPack(first, "dev-diagnostics", "@clawjs/claw @clawjs/workspace");
if (first === "secrets") {
  const { runSecretsCli } = await import("./secrets-commands.mjs");
  process.exit(await runSecretsCli(args));
}
if (first === "catalog") {
  const { runCatalogCli } = await import("./catalog-commands.mjs");
  process.exit(await runCatalogCli(args));
}
if (first && !DIRECT_ROUTER_GROUPS.has(first) && !DENSE_GROUP_MODULES.has(first) && first !== "domains" && first !== "memory" && first !== "user") {
  const { isStableClawCliCommandName, resolveBuiltinCollectionAlias } = await importCoreCompactCatalogs();
  if (!isStableClawCliCommandName(first)) {
  const canonical = resolveBuiltinCollectionAlias(first);
  if (canonical) {
    const verb = args[1] ?? "list";
    const rest = args.slice(2);
    if (DATABASE_ACTIONS.has(verb)) {
      args.splice(0, args.length, "db", canonical, verb, ...rest);
    }
  }
  }
}
if (DENSE_GROUP_MODULES.has(first)) {
  const moduleId = DENSE_GROUP_MODULES.get(first);
  const config = await readWorkspaceModules();
  if (!new Set(config.enabledModules ?? []).has(moduleId)) {
    const message = `\`claw ${first}\` is available but not enabled. Enable it with \`claw modules enable ${moduleId}\` before using this area.`;
    if (wantsJson()) writeJsonError(first, "module_not_enabled", message, { requiredModule: moduleId });
    else console.error(message);
    process.exit(64);
  }
  if (!(await hasPackage("@clawjs/domain-pack-dense-data"))) missingPack(first, moduleId, "@clawjs/domain-pack-dense-data");
}
if (LOCAL_DATA_LEGACY_GROUPS.has(args[0]) || RUNTIME_GROUPS.has(args[0])) {
  if (LOCAL_DATA_LEGACY_GROUPS.has(args[0]) && !(await hasPackage("@clawjs/local-data"))) {
    missingPack(args[0] === "db" ? "database" : args[0], "local-data", "@clawjs/local-data");
  }
  if (await runCliRouterAndExit()) {
    process.exit();
  }
  const fs = await import("node:fs");
  const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist");
  const legacyChunk = fs.readdirSync(distDir)
    .filter((fileName) => fileName.startsWith("cli-legacy-") && fileName.endsWith(".js"))
    .map((fileName) => ({ fileName, mtimeMs: fs.statSync(path.join(distDir, fileName)).mtimeMs }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs || a.fileName.localeCompare(b.fileName))[0]?.fileName;
  if (!legacyChunk) {
    console.error("[claw] CLI legacy local-data chunk not built");
    process.exit(1);
  }
  const { runCli: runLegacyCli } = await import(path.join(distDir, legacyChunk));
  const exitCode = await runLegacyCli(args, {
    stdout: process.stdout,
    stderr: process.stderr,
    stdin: process.stdin,
    cwd: process.cwd(),
    binName: publicBinName,
  });
  process.exitCode = exitCode;
  await new Promise((resolve) => process.stdout.write("", resolve));
  await new Promise((resolve) => process.stderr.write("", resolve));
  process.exit();
}
if (first === "open" && args[1] === "secrets") {
  const { runOpenSecrets } = await import("./secrets-server-launcher.mjs");
  process.exit(await runOpenSecrets(args.slice(2)));
}
if (first === "open" && args[1] === "database") {
  const { runOpenDatabase } = await import("./database-server-launcher.mjs");
  process.exit(await runOpenDatabase(args.slice(2)));
}
if (first === "open" && args[1] === "memory") {
  const { runOpenMemory } = await import("./memory-server-launcher.mjs");
  process.exit(await runOpenMemory(args.slice(2)));
}
if (first === "open" && args[1] === "drive") {
  const { runOpenDrive } = await import("./drive-server-launcher.mjs");
  process.exit(await runOpenDrive(args.slice(2)));
}
if (first === "open" && args[1] === "audio") {
  const { runOpenAudio } = await import("./audio-server-launcher.mjs");
  process.exit(await runOpenAudio(args.slice(2)));
}
if (first === "open" && args[1] === "index") {
  const { runOpenIndex } = await import("./index-server-launcher.mjs");
  process.exit(await runOpenIndex(args.slice(2)));
}
if (first === "open" && args[1] === "sessions") {
  const { runOpenSessions } = await import("./sessions-server-launcher.mjs");
  process.exit(await runOpenSessions(args.slice(2)));
}

// Fall back to the existing Claw CLI for everything else.
if (!(await runCliRouterAndExit())) {
  console.error("[claw] CLI router not available");
  process.exit(1);
}
