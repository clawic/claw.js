#!/usr/bin/env node

import path from "path";
import { fileURLToPath } from "node:url";

import { runSecretsCli, CLAW_SECRETS_GROUPS } from "./secrets-commands.mjs";
import { runOpenSecrets } from "./secrets-server-launcher.mjs";
import { runOpenDatabase } from "./database-server-launcher.mjs";
import { runMemoryCli, CLAW_MEMORY_GROUPS } from "./memory-commands.mjs";
import { runOpenMemory } from "./memory-server-launcher.mjs";
import { runOpenDrive } from "./drive-server-launcher.mjs";
import { runOpenTelegram } from "./telegram-server-launcher.mjs";
import { runOpenAudio } from "./audio-server-launcher.mjs";
import { runOpenIndex } from "./index-server-launcher.mjs";
import { runOpenSessions } from "./sessions-server-launcher.mjs";
import { runCatalogCli, CATALOG_GROUPS } from "./catalog-commands.mjs";
import { BUILTIN_COLLECTIONS_BY_ALIAS, isStableClawCliCommand } from "@clawjs/core";

const invokedBinName = path.basename(process.argv[1] || "claw");
const publicBinName = invokedBinName === "claw.mjs" ? "claw" : invokedBinName;

const args = process.argv.slice(2);

// Secrets/Memory subcommands first (small router; the heavy CLI lives in dist/index.js).
const first = args[0];
if (first && CLAW_SECRETS_GROUPS.has(first)) {
  process.exit(await runSecretsCli(args));
}
if (first && CLAW_MEMORY_GROUPS.has(first)) {
  process.exit(await runMemoryCli(args));
}
if (first && CATALOG_GROUPS.has(first)) {
  process.exit(await runCatalogCli(args));
}
if (first && BUILTIN_COLLECTIONS_BY_ALIAS.has(first.toLowerCase()) && !isStableClawCliCommand(first)) {
  const canonical = BUILTIN_COLLECTIONS_BY_ALIAS.get(first.toLowerCase());
  const verb = args[1] ?? "list";
  const rest = args.slice(2);
  args.splice(0, args.length, "db", canonical, verb, ...rest);
}
if (first === "open" && args[1] === "secrets") {
  process.exit(await runOpenSecrets(args.slice(2)));
}
if (first === "open" && args[1] === "database") {
  process.exit(await runOpenDatabase(args.slice(2)));
}
if (first === "open" && args[1] === "memory") {
  process.exit(await runOpenMemory(args.slice(2)));
}
if (first === "open" && args[1] === "drive") {
  process.exit(await runOpenDrive(args.slice(2)));
}
if (first === "open" && args[1] === "telegram") {
  process.exit(await runOpenTelegram(args.slice(2)));
}
if (first === "open" && args[1] === "audio") {
  process.exit(await runOpenAudio(args.slice(2)));
}
if (first === "open" && args[1] === "index") {
  process.exit(await runOpenIndex(args.slice(2)));
}
if (first === "open" && args[1] === "sessions") {
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
  cwd: process.cwd(),
  binName: publicBinName,
});

process.exit(exitCode);
