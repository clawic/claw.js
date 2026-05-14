// Launcher for `claw open audio`. Mirrors `database-server-launcher.mjs`.
// Boots the bundled @clawjs/audio server with deterministic flags so the
// Clawix Mac supervisor can spawn it with --port / --workspace /
// --status-file and read back the status file to know we are ready.
//
// Resolution order for buildAudioApp():
//   1) Bundled ESM (Mac packaging copies node_modules/@clawjs/audio).
//   2) Dev fallback through the workspace package source.

import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolveClawPersistentSurfacePath } from "@clawjs/core";
import { readLocalAdminBootstrap } from "./local-admin-bootstrap.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

async function loadBuildAudioApp() {
  try {
    const mod = await import("@clawjs/audio");
    if (mod && typeof mod.buildAudioApp === "function") {
      return mod.buildAudioApp;
    }
  } catch {
    // Falls through to dev candidates below.
  }

  const candidates = [
    path.join(HERE, "../../clawjs-audio/dist/index.js"),
    path.join(HERE, "../../clawjs-audio/src/index.ts"),
    path.join(HERE, "../../clawjs-audio/src/app.ts"),
  ];
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    try {
      const mod = await import(pathToFileURL(candidate).href);
      if (mod && typeof mod.buildAudioApp === "function") {
        return mod.buildAudioApp;
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
    console.error(`[audio] could not write status file: ${err?.message ?? err}`);
  }
}

function expandHome(value) {
  return value?.startsWith("~/") ? path.join(os.homedir(), value.slice(2)) : value;
}

function defaultClawjsDataRoot(flags) {
  const explicit = flags["data-dir"] ?? process.env.CLAW_AUDIO_DATA_DIR ?? process.env.CLAW_DATA_DIR ?? process.env.CLAWIX_CLAW_DATA_DIR ?? process.env.CLAWIX_CLAW_DATA_DIR;
  if (explicit) return path.resolve(expandHome(explicit));
  if (process.env.CLAW_HOME) return path.join(expandHome(process.env.CLAW_HOME), "data");
  return expandHome(resolveClawPersistentSurfacePath("claw.global.data"));
}

export async function runOpenAudio(args) {
  const flags = parseFlags(args);
  const bootstrap = await readLocalAdminBootstrap();

  const port = flags.port ? Number(flags.port) : Number(process.env.CLAW_AUDIO_PORT ?? 24151);
  const host = flags.host ?? flags.bind ?? process.env.CLAW_AUDIO_HOST ?? "127.0.0.1";
  const workspace = flags.workspace ?? process.env.CLAW_WORKSPACE ?? process.cwd();
  const dataDir = defaultClawjsDataRoot(flags);
  const blobsDir = flags["blobs-dir"] ?? process.env.CLAW_AUDIO_BLOBS_DIR ?? path.join(dataDir, "audio");
  const dbPath = flags["db-path"] ?? process.env.CLAW_AUDIO_DB_PATH ?? path.join(dataDir, "audio.sqlite");
  const statusFile = flags["status-file"];
  const sharedSecret = flags.secret ?? bootstrap.adminToken ?? process.env.CLAW_AUDIO_SHARED_SECRET;

  const buildAudioApp = await loadBuildAudioApp();
  if (!buildAudioApp) {
    console.error("[claw open audio] could not locate buildAudioApp().");
    console.error("Tried @clawjs/audio and the workspace fallback paths.");
    return 1;
  }

  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(blobsDir, { recursive: true });

  const { app, config } = buildAudioApp({
    config: {
      host,
      port,
      dataDir,
      blobsDir,
      dbPath,
      ...(sharedSecret ? { sharedSecret } : {}),
    },
  });

  try {
    await app.listen({ host: config.host, port: config.port });
  } catch (err) {
    console.error(`[claw open audio] failed to listen on ${config.host}:${config.port}: ${err?.message ?? err}`);
    writeStatusFile(statusFile, {
      service: "audio",
      ready: false,
      error: String(err?.message ?? err),
      pid: process.pid,
      at: new Date().toISOString(),
    });
    return 1;
  }

  writeStatusFile(statusFile, {
    service: "audio",
    ready: true,
    host: config.host,
    port: config.port,
    pid: process.pid,
    workspace,
    dataDir,
    blobsDir,
    dbPath,
    at: new Date().toISOString(),
  });

  console.log(`[audio] listening on http://${config.host}:${config.port}`);

  const shutdown = async (signal) => {
    console.log(`[audio] received ${signal}, shutting down`);
    try {
      await app.close();
    } catch (err) {
      console.error(`[audio] error during shutdown: ${err?.message ?? err}`);
    }
    writeStatusFile(statusFile, {
      service: "audio",
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
