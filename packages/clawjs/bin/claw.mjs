#!/usr/bin/env node

import path from "path";
import { fileURLToPath } from "node:url";

const invokedBinName = path.basename(process.argv[1] || "claw");
const publicBinName = invokedBinName === "claw.mjs" ? "claw" : invokedBinName;

const args = process.argv.slice(2);

// Bin-level shims stay lazy; the main CLI router is loaded only after command
// selection.
const first = args[0];
if (first === "secrets") {
  const { runSecretsCli } = await import("./secrets-commands.mjs");
  process.exit(await runSecretsCli(args));
}
if (first === "catalog") {
  const { runCatalogCli } = await import("./catalog-commands.mjs");
  process.exit(await runCatalogCli(args));
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
