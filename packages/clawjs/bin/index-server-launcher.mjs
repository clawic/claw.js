// Launcher for `claw open index`. Mirrors `database-server-launcher.mjs`.
// Boots the bundled @clawjs/index server with deterministic flags so the
// Clawix Mac supervisor can spawn it with --port / --workspace /
// --status-file and read back the status file to know we are ready.

import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

async function loadBuildIndexApp() {
  try {
    const mod = await import("@clawjs/index");
    if (mod && typeof mod.buildIndexApp === "function") return mod.buildIndexApp;
  } catch {
    /* fall through */
  }
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
    console.error(`[index] could not write status file: ${err?.message ?? err}`);
  }
}

function expandHome(value) {
  return value?.startsWith("~/") ? path.join(os.homedir(), value.slice(2)) : value;
}

function defaultClawjsDataRoot(flags) {
  const explicit = flags["data-dir"] ?? process.env.INDEX_DATA_DIR ?? process.env.CLAWJS_MAIN_DATA_DIR ?? process.env.CLAWIX_CLAWJS_DATA_DIR;
  if (explicit) return path.resolve(expandHome(explicit));
  if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Application Support", "Clawix", "clawjs");
  if (process.platform === "win32") return path.join(process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"), "Clawix", "clawjs");
  return path.join(process.env.XDG_DATA_HOME ?? path.join(os.homedir(), ".local", "share"), "Clawix", "clawjs");
}

export async function runOpenIndex(args) {
  const flags = parseFlags(args);
  const port = flags.port ? Number(flags.port) : Number(process.env.INDEX_PORT ?? 7796);
  const host = flags.host ?? flags.bind ?? process.env.INDEX_HOST ?? "127.0.0.1";
  const workspace = flags.workspace ?? process.env.CLAWJS_WORKSPACE ?? process.cwd();
  const dataDir = defaultClawjsDataRoot(flags);
  const dbPath = flags["db-path"] ?? process.env.INDEX_DB_PATH ?? path.join(dataDir, "search.sqlite");
  const statusFile = flags["status-file"];

  const buildIndexApp = await loadBuildIndexApp();
  if (!buildIndexApp) {
    console.error("[claw open index] could not locate buildIndexApp().");
    return 1;
  }

  fs.mkdirSync(dataDir, { recursive: true });
  const { app, config } = buildIndexApp({
    config: {
      host, port, dataDir, dbPath,
      ...(flags.secret ? { jwtSecret: flags.secret } : {}),
    },
  });

  try {
    await app.listen({ host: config.host, port: config.port });
  } catch (err) {
    console.error(`[claw open index] failed to listen on ${config.host}:${config.port}: ${err?.message ?? err}`);
    writeStatusFile(statusFile, { service: "index", ready: false, error: String(err?.message ?? err), pid: process.pid, at: new Date().toISOString() });
    return 1;
  }

  writeStatusFile(statusFile, { service: "index", ready: true, host: config.host, port: config.port, pid: process.pid, workspace, dataDir, dbPath, at: new Date().toISOString() });
  console.log(`[index] listening on http://${config.host}:${config.port}`);

  const shutdown = async (signal) => {
    console.log(`[index] received ${signal}, shutting down`);
    try { await app.close(); } catch (err) { console.error(`[index] error during shutdown: ${err?.message ?? err}`); }
    writeStatusFile(statusFile, { service: "index", ready: false, stopped: true, pid: process.pid, at: new Date().toISOString() });
    process.exit(0);
  };
  process.once("SIGTERM", () => { void shutdown("SIGTERM"); });
  process.once("SIGINT", () => { void shutdown("SIGINT"); });
  return new Promise(() => { /* keep alive */ });
}
