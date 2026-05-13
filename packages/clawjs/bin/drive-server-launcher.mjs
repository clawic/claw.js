// Launcher for `claw open drive`. Starts the bundled Drive server.
// The drive server source lives in `drive/` (workspace sibling) and is
// bundled by the Clawix Mac packaging step into the same dir as this
// launcher; in dev mode (running from the workspace) we resolve via the
// sibling path.

import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

function findServerEntry() {
  const candidates = [
    path.join(HERE, "drive-server.mjs"),                                       // co-located after Mac bundling
    path.join(HERE, "../drive-server/dist/server.js"),                         // packed monorepo dep
    path.join(HERE, "../../../drive/dist/server.js"),                          // dev: built once
    path.join(HERE, "../../../drive/src/bin/server.ts"),                       // dev: tsx fallback
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function expandHome(value) {
  return value?.startsWith("~/") ? path.join(os.homedir(), value.slice(2)) : value;
}

function defaultClawjsDataRoot(flags) {
  const explicit = flags["data-dir"] ?? process.env.DRIVE_DATA_DIR ?? process.env.CLAWJS_MAIN_DATA_DIR ?? process.env.CLAWIX_CLAWJS_DATA_DIR;
  if (explicit) return path.resolve(expandHome(explicit));
  if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Application Support", "Clawix", "clawjs");
  if (process.platform === "win32") return path.join(process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"), "Clawix", "clawjs");
  return path.join(process.env.XDG_DATA_HOME ?? path.join(os.homedir(), ".local", "share"), "Clawix", "clawjs");
}

export async function runOpenDrive(args) {
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next === undefined || next.startsWith("--")) {
        flags[key] = "true";
      } else {
        flags[key] = next;
        i++;
      }
    }
  }

  if (flags.port) process.env.DRIVE_PORT = flags.port;
  if (flags.host) process.env.DRIVE_HOST = flags.host;
  const dataDir = defaultClawjsDataRoot(flags);
  process.env.DRIVE_DATA_DIR = dataDir;
  process.env.DRIVE_DB_PATH = flags["db-path"] ?? process.env.DRIVE_DB_PATH ?? path.join(dataDir, "drive.sqlite");
  if (flags["status-file"]) process.env.DRIVE_STATUS_FILE = flags["status-file"];
  if (flags["ocr-sidecar"]) process.env.DRIVE_OCR_SIDECAR = flags["ocr-sidecar"];
  if (flags["embed-sidecar"]) process.env.DRIVE_EMBED_SIDECAR = flags["embed-sidecar"];
  if (flags["cloudflared"]) process.env.DRIVE_CLOUDFLARED = flags["cloudflared"];

  const entry = findServerEntry();
  if (!entry) {
    console.error("[claw open drive] could not locate the drive server entrypoint.");
    console.error("Expected one of:");
    console.error("  - <cli>/bin/drive-server.mjs (bundled)");
    console.error("  - clawjs/drive/dist/server.js (built)");
    console.error("  - clawjs/drive/src/bin/server.ts (dev, requires tsx)");
    return 1;
  }

  if (entry.endsWith(".ts")) {
    const { spawn } = await import("node:child_process");
    const tsx = path.join(HERE, "../../../node_modules/.bin/tsx");
    const child = spawn(tsx, [entry, ...args], {
      stdio: "inherit",
      env: { ...process.env },
    });
    return await new Promise((resolve) => child.on("close", (code) => resolve(code ?? 1)));
  }

  const mod = await import(pathToFileURL(entry).href);
  if (mod && typeof mod.startDriveServer === "function") {
    const overrides = {};
    if (flags.port) overrides.config = { ...(overrides.config ?? {}), port: Number(flags.port) };
    if (flags.host) overrides.config = { ...(overrides.config ?? {}), host: flags.host };
    overrides.config = {
      ...(overrides.config ?? {}),
      dataDir,
      dbPath: process.env.DRIVE_DB_PATH,
    };
    if (flags["status-file"]) overrides.statusFile = flags["status-file"];
    if (flags["ocr-sidecar"]) overrides.ocrSidecarPath = flags["ocr-sidecar"];
    if (flags["embed-sidecar"]) overrides.embedSidecarPath = flags["embed-sidecar"];
    if (flags["cloudflared"]) overrides.cloudflaredPath = flags["cloudflared"];
    const { config } = await mod.startDriveServer(overrides);
    console.log(`[drive] listening on ${config.host}:${config.port}`);
    return new Promise(() => {});
  }

  console.error("[claw open drive] entry does not export startDriveServer().");
  return 1;
}
