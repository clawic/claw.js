// Launcher for `claw open secrets`. Starts the bundled Secrets server. The
// secrets server source lives in `secrets/` (workspace sibling) and is
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
    path.join(HERE, "secrets-server.mjs"),                                       // co-located after Mac bundling
    path.join(HERE, "../secrets-server/dist/server.js"),                         // packed monorepo dep
    path.join(HERE, "../../../secrets/dist/server.js"),                          // dev: built once
    path.join(HERE, "../../../secrets/src/bin/server.ts"),                       // dev: tsx fallback
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
  const explicit = flags["data-dir"] ?? process.env.SECRETS_DATA_DIR ?? process.env.CLAW_DATA_DIR ?? process.env.CLAW_DATA_DIR ?? process.env.CLAWIX_CLAW_DATA_DIR ?? process.env.CLAWIX_CLAW_DATA_DIR;
  if (explicit) return path.resolve(expandHome(explicit));
  return path.join(expandHome(process.env.CLAW_HOME ?? path.join(os.homedir(), ".claw")), "data");
}

export async function runOpenSecrets(args) {
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

  if (flags.port) process.env.SECRETS_PORT = flags.port;
  if (flags.host) process.env.SECRETS_HOST = flags.host;
  const dataDir = defaultClawjsDataRoot(flags);
  process.env.SECRETS_DATA_DIR = dataDir;
  process.env.SECRETS_DB_PATH = flags["db-path"] ?? process.env.SECRETS_DB_PATH ?? path.join(dataDir, "vault.sqlite");

  const entry = findServerEntry();
  if (!entry) {
    console.error("[claw open secrets] could not locate the secrets server entrypoint.");
    console.error("Expected one of:");
    console.error("  - <cli>/bin/secrets-server.mjs (bundled)");
    console.error("  - clawjs/secrets/dist/server.js (built)");
    console.error("  - clawjs/secrets/src/bin/server.ts (dev, requires tsx)");
    return 1;
  }

  if (entry.endsWith(".ts")) {
    // Dev: spawn tsx for TypeScript entry.
    const { spawn } = await import("node:child_process");
    const tsx = path.join(HERE, "../../../node_modules/.bin/tsx");
    const child = spawn(tsx, [entry, ...args], {
      stdio: "inherit",
      env: { ...process.env },
    });
    return await new Promise((resolve) => child.on("close", (code) => resolve(code ?? 1)));
  }

  if (entry.endsWith("/secrets/dist/server.js")) {
    const { spawn } = await import("node:child_process");
    const child = spawn(process.execPath, [entry, ...args], {
      stdio: "inherit",
      env: { ...process.env },
    });
    return await new Promise((resolve) => child.on("close", (code) => resolve(code ?? 1)));
  }

  const mod = await import(pathToFileURL(entry).href);
  if (mod && typeof mod.startSecretsServer === "function") {
    const overrides = {};
    if (flags.port) overrides.config = { ...(overrides.config ?? {}), port: Number(flags.port) };
    if (flags.host) overrides.config = { ...(overrides.config ?? {}), host: flags.host };
    overrides.config = {
      ...(overrides.config ?? {}),
      dataDir,
      dbPath: process.env.SECRETS_DB_PATH,
    };
    if (flags["status-file"]) overrides.statusFile = flags["status-file"];
    const { config } = await mod.startSecretsServer(overrides);
    console.log(`[secrets] listening on ${config.host}:${config.port}`);
    return 0;
  }

  console.error("[claw open secrets] entry does not export startSecretsServer().");
  return 1;
}
