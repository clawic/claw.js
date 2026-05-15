import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolveClawPersistentSurfacePath } from "@clawjs/core";
import { readLocalAdminBootstrap } from "./local-admin-bootstrap.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

async function loadBuildSessionsApp() {
  try {
    const mod = await import("@clawjs/sessions");
    if (mod && typeof mod.buildSessionsApp === "function") {
      return mod.buildSessionsApp;
    }
  } catch {
    // Falls through to dev candidates below.
  }

  const candidates = [
    path.join(HERE, "../../clawjs-sessions/dist/index.js"),
    path.join(HERE, "../../clawjs-sessions/src/index.ts"),
    path.join(HERE, "../../clawjs-sessions/src/app.ts"),
  ];
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    try {
      const mod = await import(pathToFileURL(candidate).href);
      if (mod && typeof mod.buildSessionsApp === "function") {
        return mod.buildSessionsApp;
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
    console.error(`[sessions] could not write status file: ${err?.message ?? err}`);
  }
}

function expandHome(value) {
  return value?.startsWith("~/") ? path.join(os.homedir(), value.slice(2)) : value;
}

function defaultClawjsDataRoot(flags) {
  const explicit = flags["data-dir"] ?? process.env.CLAW_SESSIONS_DATA_DIR ?? process.env.CLAW_DATA_DIR;
  if (explicit) return path.resolve(expandHome(explicit));
  if (process.env.CLAW_HOME) return path.join(expandHome(process.env.CLAW_HOME), "data");
  return expandHome(resolveClawPersistentSurfacePath("claw.global.data"));
}

export async function runOpenSessions(args) {
  const flags = parseFlags(args);
  const bootstrap = await readLocalAdminBootstrap();

  const port = flags.port ? Number(flags.port) : Number(process.env.CLAW_SESSIONS_PORT ?? process.env.PORT ?? 24101);
  const host = flags.host ?? flags.bind ?? process.env.CLAW_SESSIONS_HOST ?? process.env.HOST ?? "127.0.0.1";
  const workspace = flags.workspace ?? process.env.CLAW_WORKSPACE ?? process.cwd();
  const dataDir = defaultClawjsDataRoot(flags);
  const dbPath = flags["db-path"] ?? process.env.CLAW_SESSIONS_DB_PATH ?? path.join(dataDir, "sessions.sqlite");
  const statusFile = flags["status-file"];
  const sharedSecret = flags.secret ?? bootstrap.adminToken ?? process.env.CLAW_SESSIONS_SHARED_SECRET;

  const buildSessionsApp = await loadBuildSessionsApp();
  if (!buildSessionsApp) {
    console.error("[claw open sessions] could not locate buildSessionsApp().");
    console.error("Tried @clawjs/sessions and the workspace fallback paths.");
    return 1;
  }

  fs.mkdirSync(dataDir, { recursive: true });

  const { app, config } = buildSessionsApp({
    config: {
      host,
      port,
      dataDir,
      dbPath,
      ...(sharedSecret ? { sharedSecret } : {}),
    },
  });

  try {
    await app.listen({ host: config.host, port: config.port });
  } catch (err) {
    console.error(`[claw open sessions] failed to listen on ${config.host}:${config.port}: ${err?.message ?? err}`);
    writeStatusFile(statusFile, {
      service: "sessions",
      ready: false,
      error: String(err?.message ?? err),
      pid: process.pid,
      at: new Date().toISOString(),
    });
    return 1;
  }

  writeStatusFile(statusFile, {
    service: "sessions",
    ready: true,
    host: config.host,
    port: config.port,
    pid: process.pid,
    workspace,
    dataDir,
    dbPath,
    at: new Date().toISOString(),
  });

  console.log(`[sessions] listening on http://${config.host}:${config.port}`);

  const shutdown = async (signal) => {
    console.log(`[sessions] received ${signal}, shutting down`);
    try {
      await app.close();
    } catch (err) {
      console.error(`[sessions] error during shutdown: ${err?.message ?? err}`);
    }
    writeStatusFile(statusFile, {
      service: "sessions",
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
    // Keep the sidecar process alive until the supervising app sends a signal.
  });
}
