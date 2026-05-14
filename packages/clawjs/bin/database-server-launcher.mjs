// Launcher for `claw open database`. Mirrors `secrets-server-launcher.mjs`.
// Boots the bundled @clawjs/database server with deterministic flags so the
// Clawix Mac supervisor can spawn it with --port / --workspace /
// --status-file and read back the status file to know we are ready.
//
// Resolution order for buildDatabaseApp():
//   1) Bundled ESM (Mac packaging copies node_modules/@clawjs/database).
//   2) Dev fallback through the workspace package source.

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolveClawPersistentSurfacePath } from "@clawjs/core";
import { readLocalAdminBootstrap } from "./local-admin-bootstrap.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

async function loadBuildDatabaseApp() {
  // Try the published @clawjs/database package first (bundled by the Mac
  // packaging step alongside @clawjs/cli).
  try {
    const mod = await import("@clawjs/database");
    if (mod && typeof mod.buildDatabaseApp === "function") {
      return mod.buildDatabaseApp;
    }
  } catch {
    // Falls through to dev candidates below.
  }

  const candidates = [
    path.join(HERE, "../../clawjs-database/dist/index.js"),
    path.join(HERE, "../../clawjs-database/src/index.ts"),
    path.join(HERE, "../../clawjs-database/src/app.ts"),
  ];
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    try {
      const mod = await import(pathToFileURL(candidate).href);
      if (mod && typeof mod.buildDatabaseApp === "function") {
        return mod.buildDatabaseApp;
      }
    } catch {
      // try next
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
    console.error(`[database] could not write status file: ${err?.message ?? err}`);
  }
}

export async function runOpenDatabase(args) {
  const flags = parseFlags(args);
  const bootstrap = await readLocalAdminBootstrap();

  const port = flags.port ? Number(flags.port) : Number(process.env.CLAW_DATABASE_PORT ?? 24102);
  const host = flags.host ?? flags.bind ?? process.env.CLAW_DATABASE_HOST ?? "127.0.0.1";
  const workspace = flags.workspace ?? process.env.CLAW_WORKSPACE ?? process.cwd();
  const defaultDataDir = process.env.CLAW_HOME
    ? path.join(process.env.CLAW_HOME, "data")
    : resolveClawPersistentSurfacePath("claw.global.data");
  const dataDir = flags["data-dir"] ?? process.env.CLAW_DATA_DIR ?? process.env.CLAWIX_CLAW_DATA_DIR ?? defaultDataDir;
  const filesDir = flags["files-dir"] ?? path.join(dataDir, "files");
  const dbPath = flags["db-path"] ?? process.env.CLAW_DB_PATH ?? path.join(dataDir, "core.sqlite");
  const statusFile = flags["status-file"];

  const buildDatabaseApp = await loadBuildDatabaseApp();
  if (!buildDatabaseApp) {
    console.error("[claw open database] could not locate buildDatabaseApp().");
    console.error("Tried @clawjs/database and the workspace fallback paths.");
    return 1;
  }

  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(filesDir, { recursive: true });

  const { app, config } = buildDatabaseApp({
    ...(bootstrap.adminToken ? { adminToken: bootstrap.adminToken } : {}),
    config: {
      host,
      port,
      dataDir,
      filesDir,
      dbPath,
      ...(flags.secret ? { jwtSecret: flags.secret } : {}),
    },
  });

  try {
    await app.listen({ host: config.host, port: config.port });
  } catch (err) {
    console.error(`[claw open database] failed to listen on ${config.host}:${config.port}: ${err?.message ?? err}`);
    writeStatusFile(statusFile, {
      service: "database",
      ready: false,
      error: String(err?.message ?? err),
      pid: process.pid,
      at: new Date().toISOString(),
    });
    return 1;
  }

  writeStatusFile(statusFile, {
    service: "database",
    ready: true,
    host: config.host,
    port: config.port,
    pid: process.pid,
    workspace,
    dataDir,
    filesDir,
    dbPath,
    at: new Date().toISOString(),
  });

  console.log(`[database] listening on http://${config.host}:${config.port}`);

  const shutdown = async (signal) => {
    console.log(`[database] received ${signal}, shutting down`);
    try {
      await app.close();
    } catch (err) {
      console.error(`[database] error during shutdown: ${err?.message ?? err}`);
    }
    writeStatusFile(statusFile, {
      service: "database",
      ready: false,
      stopped: true,
      pid: process.pid,
      at: new Date().toISOString(),
    });
    process.exit(0);
  };

  process.once("SIGTERM", () => { void shutdown("SIGTERM"); });
  process.once("SIGINT", () => { void shutdown("SIGINT"); });

  return new Promise(() => {
    // keep alive until a signal
  });
}
