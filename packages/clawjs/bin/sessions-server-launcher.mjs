import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolveClawGlobalDataStorageDir } from "@clawjs/core";
import { readLocalAdminBootstrap } from "./local-admin-bootstrap.mjs";
import { createLauncherDiagnostic, printLauncherFailure } from "./launcher-diagnostics.mjs";

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
    printOpenSessionsFailure(createLauncherDiagnostic(
      "claw_open_sessions_status_file_write_failed",
      "Could not write the sessions status file.",
      {
        location: "--status-file",
        suggestion: "Choose a writable status-file path or fix directory permissions.",
        safeNextStep: "Rerun claw open sessions with a writable --status-file path.",
      },
    ));
  }
}

function defaultClawjsDataRoot(flags) {
  const explicit = flags["data-dir"] ?? process.env.CLAW_SESSIONS_DATA_DIR ?? process.env.CLAW_DATA_DIR;
  if (explicit) return path.resolve(resolveClawGlobalDataStorageDir({ homeDir: os.homedir(), dataDir: explicit }));
  const clawHome = process.env.CLAW_HOME;
  return resolveClawGlobalDataStorageDir({
    homeDir: os.homedir(),
    ...(clawHome ? { clawHome } : {}),
  });
}

function printOpenSessionsFailure(diagnostic) {
  printLauncherFailure("claw open sessions failed:", [diagnostic]);
}

function runOpenSessionsSelfTest() {
  const chunks = [];
  printLauncherFailure("claw open sessions failed for /Users/example/private", [
    createLauncherDiagnostic("claw_open_sessions_listen_failed", "token: sk-test-secret-123456", {
      location: "/Users/example/private/sessions",
      suggestion: "Choose a free --port or fix host binding.",
      safeNextStep: "Rerun claw open sessions --port <free-port>.",
    }),
  ], { write: (chunk) => chunks.push(chunk) });
  const output = chunks.join("");
  if (!output.includes("code: claw_open_sessions_listen_failed")) throw new Error("self-test missing stable code");
  if (!output.includes("suggestion: Choose a free --port or fix host binding.")) throw new Error("self-test missing suggestion");
  if (!output.includes("next: Rerun claw open sessions --port <free-port>.")) throw new Error("self-test missing next step");
  if (output.includes("/Users/example") || output.includes("sk-test-secret-123456")) throw new Error("self-test leaked private data");
  console.log("sessions launcher diagnostics self-test passed");
}

export async function runOpenSessions(args) {
  if (args.includes("--self-test")) {
    runOpenSessionsSelfTest();
    return 0;
  }
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
    printOpenSessionsFailure(createLauncherDiagnostic(
      "claw_open_sessions_build_app_missing",
      "Could not locate buildSessionsApp().",
      {
        location: "@clawjs/sessions",
        suggestion: "Build or bundle the sessions package so buildSessionsApp is importable.",
        safeNextStep: "Run npm --workspace @clawjs/sessions run build, then rerun claw open sessions.",
      },
    ));
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
    printOpenSessionsFailure(createLauncherDiagnostic(
      "claw_open_sessions_listen_failed",
      "Sessions server failed to listen on the requested host and port.",
      {
        location: `sessions:${config.host}:${config.port}`,
        suggestion: "Check whether the port is already in use or the host binding is unavailable.",
        safeNextStep: "Choose a free --port or stop the process using the current sessions port, then rerun claw open sessions.",
      },
    ));
    writeStatusFile(statusFile, {
      service: "sessions",
      ready: false,
      error: "claw_open_sessions_listen_failed",
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
      printOpenSessionsFailure(createLauncherDiagnostic(
        "claw_open_sessions_shutdown_failed",
        "Sessions server shutdown failed.",
        {
          location: "sessions.shutdown",
          suggestion: "Inspect local sessions server logs before restarting.",
          safeNextStep: "Stop any remaining sessions process, then rerun claw open sessions.",
        },
      ));
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
