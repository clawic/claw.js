#!/usr/bin/env node

import path from "path";
import { fileURLToPath } from "node:url";
import { isStableClawCliCommandName, resolveBuiltinCollectionAlias } from "@clawjs/core/compact-catalogs";

const invokedBinName = path.basename(process.argv[1] || "claw");
const publicBinName = invokedBinName === "claw.mjs" ? "claw" : invokedBinName;

const args = process.argv.slice(2);

// Bin-level shims stay lazy; the main CLI router is loaded only after command
// selection.
const first = args[0];
const second = args[1];

const DATA_GROUPS = new Set(["db", "records", "tasks", "task", "notes", "note", "projects", "project", "people", "person", "goals", "goal", "reminders", "reminder", "deadlines", "deadline", "work", "memory"]);
const RUNTIME_GROUPS = new Set(["chat", "provider", "code", "runtime", "workspace"]);

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
  try {
    await import(packageName);
    return true;
  } catch (error) {
    const code = error?.code;
    if (code === "ERR_MODULE_NOT_FOUND" || code === "MODULE_NOT_FOUND") return false;
    throw error;
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

if (!first || args.includes("--help") || args.includes("-h")) {
  console.log(baseUsage());
  process.exit(0);
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
}
if (first === "setup") {
  const mode = ["minimal", "normal", "advanced"].includes(second) ? second : "minimal";
  const modules = moduleDefinitions();
  if (wantsJson()) writeJsonOk("setup", { applied: false, mode, scope: "global", detail: { capability: modules.filter((module) => module.kind === "capability"), area: modules.filter((module) => module.kind === "area") }, modules }, { subcommand: "preview" });
  else console.log(`Mode preview: ${mode}\n\nRequires explicit action:\n${modules.map((module) => `  ${module.id.padEnd(18)} ${module.optionalPack ?? "manual"}`).join("\n")}`);
  process.exit(0);
}
if (first === "inspect" && (second === "commands" || second === "cli")) {
  const commands = ["help", "setup", "modules", "inspect", "collections", "db", "tasks", "search", "chat", "code"];
  if (wantsJson()) writeJsonOk("inspect", commands.map((command) => ({ id: `claw.cli.command.${command}`, value: command })), { subcommand: second });
  else console.log(commands.join("\n"));
  process.exit(0);
}
if ((first === "collections" && second && second !== "list") || first === "records" || DATA_GROUPS.has(first)) {
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
if (first && first !== "domains" && first !== "memory" && first !== "user" && !isStableClawCliCommandName(first)) {
  const canonical = resolveBuiltinCollectionAlias(first);
  if (canonical) {
    const verb = args[1] ?? "list";
    const rest = args.slice(2);
    args.splice(0, args.length, "db", canonical, verb, ...rest);
  }
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
const distEntry = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist/index.js");
let runCli;
try {
  ({ runCli } = await import(distEntry));
} catch (err) {
  console.error("[claw] CLI dist not built:", err?.message ?? err);
  process.exit(1);
}

const exitCode = await runCli(args, {
  stdout: process.stdout,
  stderr: process.stderr,
  stdin: process.stdin,
  cwd: process.cwd(),
  binName: publicBinName,
});

process.exitCode = exitCode;
