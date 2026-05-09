#!/usr/bin/env node

import path from "path";
import { fileURLToPath } from "node:url";

import { runVaultCli, VAULT_GROUPS } from "./vault-commands.mjs";
import { runOpenVault } from "./vault-server-launcher.mjs";
import { runOpenDatabase } from "./database-server-launcher.mjs";
import { runMemoryCli, MEMORY_GROUPS } from "./memory-commands.mjs";
import { runOpenMemory } from "./memory-server-launcher.mjs";
import { runDriveCli, DRIVE_GROUPS } from "./drive-commands.mjs";
import { runOpenDrive } from "./drive-server-launcher.mjs";
import { runOpenTelegram } from "./telegram-server-launcher.mjs";

const args = process.argv.slice(2);

// Vault/Memory/Drive subcommands first (small router; the heavy CLI lives in dist/index.js).
const first = args[0];
if (first && VAULT_GROUPS.has(first)) {
  process.exit(await runVaultCli(args));
}
if (first && MEMORY_GROUPS.has(first)) {
  process.exit(await runMemoryCli(args));
}
if (first && DRIVE_GROUPS.has(first)) {
  process.exit(await runDriveCli(args));
}
if (first === "open" && args[1] === "vault") {
  process.exit(await runOpenVault(args.slice(2)));
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
  binName: path.basename(process.argv[1] || "claw"),
});

process.exit(exitCode);
