// Launcher for `claw open telegram`. Mirrors database-server-launcher.mjs.
// Boots the Telegram surface (Fastify app exposed by the workspace
// `integrations/telegram/` package) so the Clawix Mac supervisor can spawn it with
// --port / --workspace / --status-file and read back the status file
// to know when it is ready.
//
// Resolution order for buildTelegramApp():
//   1) Bundled ESM (when @clawjs/telegram ships, the published package).
//   2) Dev fallback through the workspace `integrations/telegram/` package source.

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

async function loadBuildTelegramApp() {
  // Try a published `@clawjs/telegram` first (none today, but the
  // resolution order is identical to the other launchers so a future
  // npm release plugs in without changing this file).
  try {
    const mod = await import("@clawjs/telegram");
    if (mod && typeof mod.buildTelegramApp === "function") {
      return mod.buildTelegramApp;
    }
  } catch {
    // Fall through to dev candidates.
  }

  const candidates = [
    // Source tree: <repo>/packages/clawjs/bin/ → <repo>/telegram/dist/
    path.join(HERE, "../../../telegram/dist/server/app.js"),
    path.join(HERE, "../../../telegram/src/server/app.ts"),
    // Bundled with dev overlay: <CLAW_DEST>/node_modules/@clawjs/cli/bin/
    // → <CLAW_DEST>/telegram/dist/
    path.join(HERE, "../../../../telegram/dist/server/app.js"),
    path.join(HERE, "../../../../telegram/src/server/app.ts"),
  ];
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    try {
      const mod = await import(pathToFileURL(candidate).href);
      if (mod && typeof mod.buildTelegramApp === "function") {
        return mod.buildTelegramApp;
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
    console.error(`[telegram] could not write status file: ${err?.message ?? err}`);
  }
}

export async function runOpenTelegram(args) {
  const flags = parseFlags(args);

  const port = flags.port ? Number(flags.port) : Number(process.env.CLAW_TELEGRAM_PORT ?? 22011);
  const host = flags.host ?? flags.bind ?? process.env.CLAW_TELEGRAM_HOST ?? "127.0.0.1";
  const workspace = flags.workspace ?? process.env.CLAW_TELEGRAM_WORKSPACE ?? process.env.CLAW_WORKSPACE ?? process.cwd();
  const statusFile = flags["status-file"];

  // Forward the path to this very CLI as CLAW_BIN so the Telegram
  // surface (which shells out to `claw telegram <subcommand> --json`)
  // can find a working executable in non-interactive contexts (the Mac
  // app launches us without inheriting a shell PATH that resolves it).
  if (!process.env.CLAW_BIN) {
    process.env.CLAW_BIN = path.resolve(HERE, "claw.mjs");
  }

  const buildTelegramApp = await loadBuildTelegramApp();
  if (!buildTelegramApp) {
    console.error("[claw open telegram] could not locate buildTelegramApp().");
    console.error("Tried @clawjs/telegram and the workspace fallback paths.");
    return 1;
  }

  const built = await buildTelegramApp({
    config: { host, port, workspace },
  });

  try {
    await built.app.listen({ host: built.config.host, port: built.config.port });
  } catch (err) {
    console.error(`[claw open telegram] failed to listen on ${built.config.host}:${built.config.port}: ${err?.message ?? err}`);
    writeStatusFile(statusFile, {
      service: "telegram",
      ready: false,
      error: String(err?.message ?? err),
      pid: process.pid,
      at: new Date().toISOString(),
    });
    return 1;
  }

  writeStatusFile(statusFile, {
    service: "telegram",
    ready: true,
    host: built.config.host,
    port: built.config.port,
    pid: process.pid,
    workspace,
    at: new Date().toISOString(),
  });

  console.log(`[telegram] listening on http://${built.config.host}:${built.config.port}`);

  const shutdown = async (signal) => {
    console.log(`[telegram] received ${signal}, shutting down`);
    try {
      await built.app.close();
    } catch (err) {
      console.error(`[telegram] error during shutdown: ${err?.message ?? err}`);
    }
    writeStatusFile(statusFile, {
      service: "telegram",
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
