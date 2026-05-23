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
import { resolveClawGlobalDataStorageDir } from "@clawjs/core";
import { readLocalAdminBootstrap } from "./local-admin-bootstrap.mjs";
import { createLauncherDiagnostic, printLauncherFailure } from "./launcher-diagnostics.mjs";

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
    printOpenAudioFailure(createLauncherDiagnostic(
      "claw_open_audio_status_file_write_failed",
      "Could not write the audio status file.",
      {
        location: "--status-file",
        suggestion: "Choose a writable status-file path or fix directory permissions.",
        safeNextStep: "Rerun claw open audio with a writable --status-file path.",
      },
    ));
  }
}

function defaultClawjsDataRoot(flags) {
  const explicit = flags["data-dir"] ?? process.env.CLAW_AUDIO_DATA_DIR ?? process.env.CLAW_DATA_DIR;
  if (explicit) return path.resolve(resolveClawGlobalDataStorageDir({ homeDir: os.homedir(), dataDir: explicit }));
  const clawHome = process.env.CLAW_HOME;
  return resolveClawGlobalDataStorageDir({
    homeDir: os.homedir(),
    ...(clawHome ? { clawHome } : {}),
  });
}

function printOpenAudioFailure(diagnostic) {
  printLauncherFailure("claw open audio failed:", [diagnostic]);
}

function runOpenAudioSelfTest() {
  const chunks = [];
  printLauncherFailure("claw open audio failed for /Users/example/private", [
    createLauncherDiagnostic("claw_open_audio_listen_failed", "token: sk-test-secret-123456", {
      location: "/Users/example/private/audio",
      suggestion: "Choose a free --port or fix host binding.",
      safeNextStep: "Rerun claw open audio --port <free-port>.",
    }),
  ], { write: (chunk) => chunks.push(chunk) });
  const output = chunks.join("");
  if (!output.includes("code: claw_open_audio_listen_failed")) throw new Error("self-test missing stable code");
  if (!output.includes("suggestion: Choose a free --port or fix host binding.")) throw new Error("self-test missing suggestion");
  if (!output.includes("next: Rerun claw open audio --port <free-port>.")) throw new Error("self-test missing next step");
  if (output.includes("/Users/example") || output.includes("sk-test-secret-123456")) throw new Error("self-test leaked private data");
  console.log("audio launcher diagnostics self-test passed");
}

export async function runOpenAudio(args) {
  if (args.includes("--self-test")) {
    runOpenAudioSelfTest();
    return 0;
  }
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
    printOpenAudioFailure(createLauncherDiagnostic(
      "claw_open_audio_build_app_missing",
      "Could not locate buildAudioApp().",
      {
        location: "@clawjs/audio",
        suggestion: "Build or bundle the audio package so buildAudioApp is importable.",
        safeNextStep: "Run npm --workspace @clawjs/audio run build, then rerun claw open audio.",
      },
    ));
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
    printOpenAudioFailure(createLauncherDiagnostic(
      "claw_open_audio_listen_failed",
      "Audio server failed to listen on the requested host and port.",
      {
        location: `audio:${config.host}:${config.port}`,
        suggestion: "Check whether the port is already in use or the host binding is unavailable.",
        safeNextStep: "Choose a free --port or stop the process using the current audio port, then rerun claw open audio.",
      },
    ));
    writeStatusFile(statusFile, {
      service: "audio",
      ready: false,
      error: "claw_open_audio_listen_failed",
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
      printOpenAudioFailure(createLauncherDiagnostic(
        "claw_open_audio_shutdown_failed",
        "Audio server shutdown failed.",
        {
          location: "audio.shutdown",
          suggestion: "Inspect local audio server logs before restarting.",
          safeNextStep: "Stop any remaining audio process, then rerun claw open audio.",
        },
      ));
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
