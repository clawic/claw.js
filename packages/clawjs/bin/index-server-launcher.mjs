// Launcher for `claw open index`. Mirrors `database-server-launcher.mjs`.
// Technical compatibility launcher for the retired Index server. Public Search
// entrypoints use `claw search ...` and the `@clawjs/search` package.

import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolveClawGlobalDataStorageDir } from "@clawjs/core";
import { readLocalAdminBootstrap } from "./local-admin-bootstrap.mjs";
import { createLauncherDiagnostic, printLauncherFailure } from "./launcher-diagnostics.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

async function loadBuildIndexApp() {
  const candidates = [
    path.join(HERE, "../../clawjs-index/dist/index.js"),
    path.join(HERE, "../../clawjs-index/src/index.ts"),
    path.join(HERE, "../../clawjs-index/src/app.ts"),
  ];
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    try {
      const mod = await import(pathToFileURL(candidate).href);
      if (mod && typeof mod.buildIndexApp === "function") return mod.buildIndexApp;
    } catch {
      /* try next */
    }
  }
  return null;
}

function parseFlags(args) {
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = args[i + 1];
    if (next === undefined || next.startsWith("--")) {
      flags[key] = "true";
    } else {
      flags[key] = next;
      i++;
    }
  }
  return flags;
}

function writeStatusFile(filePath, payload) {
  if (!filePath) return;
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
  } catch (err) {
    printOpenIndexFailure(createLauncherDiagnostic(
      "claw_open_index_status_file_write_failed",
      "Could not write the index status file.",
      {
        location: "--status-file",
        suggestion: "Choose a writable status-file path or fix directory permissions.",
        safeNextStep: "Rerun claw open index with a writable --status-file path.",
      },
    ));
  }
}

function defaultClawjsDataRoot(flags) {
  const explicit = flags["data-dir"] ?? process.env.CLAW_SEARCH_DATA_DIR ?? process.env.CLAW_DATA_DIR;
  if (explicit) return path.resolve(resolveClawGlobalDataStorageDir({ homeDir: os.homedir(), dataDir: explicit }));
  const clawHome = process.env.CLAW_HOME;
  return resolveClawGlobalDataStorageDir({
    homeDir: os.homedir(),
    ...(clawHome ? { clawHome } : {}),
  });
}

function printOpenIndexFailure(diagnostic) {
  printLauncherFailure("claw open index failed:", [diagnostic]);
}

function runOpenIndexSelfTest() {
  const chunks = [];
  printLauncherFailure("claw open index failed for /Users/example/private", [
    createLauncherDiagnostic("claw_open_index_listen_failed", "token: sk-test-secret-123456", {
      location: "/Users/example/private/index",
      suggestion: "Choose a free --port or fix host binding.",
      safeNextStep: "Rerun claw open index --port <free-port>.",
    }),
  ], { write: (chunk) => chunks.push(chunk) });
  const output = chunks.join("");
  if (!output.includes("code: claw_open_index_listen_failed")) throw new Error("self-test missing stable code");
  if (!output.includes("suggestion: Choose a free --port or fix host binding.")) throw new Error("self-test missing suggestion");
  if (!output.includes("next: Rerun claw open index --port <free-port>.")) throw new Error("self-test missing next step");
  if (output.includes("/Users/example") || output.includes("sk-test-secret-123456")) throw new Error("self-test leaked private data");
  console.log("index launcher diagnostics self-test passed");
}

export async function runOpenIndex(args) {
  if (args.includes("--self-test")) {
    runOpenIndexSelfTest();
    return 0;
  }
  const flags = parseFlags(args);
  const bootstrap = await readLocalAdminBootstrap();
  const port = flags.port ? Number(flags.port) : Number(process.env.CLAW_SEARCH_PORT ?? 24106);
  const host = flags.host ?? flags.bind ?? process.env.CLAW_SEARCH_HOST ?? "127.0.0.1";
  const workspace = flags.workspace ?? process.env.CLAW_WORKSPACE ?? process.cwd();
  const dataDir = defaultClawjsDataRoot(flags);
  const dbPath = flags["db-path"] ?? process.env.CLAW_SEARCH_DB_PATH ?? path.join(dataDir, "search.sqlite");
  const statusFile = flags["status-file"];

  const buildIndexApp = await loadBuildIndexApp();
  if (!buildIndexApp) {
    printOpenIndexFailure(createLauncherDiagnostic(
      "claw_open_index_build_app_missing",
      "Could not locate buildIndexApp().",
      {
        location: "clawjs-index",
        suggestion: "Build or bundle the index compatibility package so buildIndexApp is importable.",
        safeNextStep: "Run npm --workspace @clawjs/index run build, then rerun claw open index.",
      },
    ));
    return 1;
  }

  fs.mkdirSync(dataDir, { recursive: true });
  const { app, config } = buildIndexApp({
    ...(bootstrap.adminToken ? { adminToken: bootstrap.adminToken } : {}),
    config: {
      host, port, dataDir, dbPath,
      ...(flags.secret ? { jwtSecret: flags.secret } : {}),
    },
  });

  try {
    await app.listen({ host: config.host, port: config.port });
  } catch (err) {
    printOpenIndexFailure(createLauncherDiagnostic(
      "claw_open_index_listen_failed",
      "Index server failed to listen on the requested host and port.",
      {
        location: `index:${config.host}:${config.port}`,
        suggestion: "Check whether the port is already in use or the host binding is unavailable.",
        safeNextStep: "Choose a free --port or stop the process using the current index port, then rerun claw open index.",
      },
    ));
    writeStatusFile(statusFile, { service: "index", ready: false, error: "claw_open_index_listen_failed", pid: process.pid, at: new Date().toISOString() });
    return 1;
  }

  writeStatusFile(statusFile, { service: "index", ready: true, host: config.host, port: config.port, pid: process.pid, workspace, dataDir, dbPath, at: new Date().toISOString() });
  console.log(`[index] listening on http://${config.host}:${config.port}`);

  const shutdown = async (signal) => {
    console.log(`[index] received ${signal}, shutting down`);
    try {
      await app.close();
    } catch (err) {
      printOpenIndexFailure(createLauncherDiagnostic(
        "claw_open_index_shutdown_failed",
        "Index server shutdown failed.",
        {
          location: "index.shutdown",
          suggestion: "Inspect local index server logs before restarting.",
          safeNextStep: "Stop any remaining index process, then rerun claw open index.",
        },
      ));
    }
    writeStatusFile(statusFile, { service: "index", ready: false, stopped: true, pid: process.pid, at: new Date().toISOString() });
    process.exit(0);
  };
  process.once("SIGTERM", () => { void shutdown("SIGTERM"); });
  process.once("SIGINT", () => { void shutdown("SIGINT"); });
  return new Promise(() => { /* keep alive */ });
}
