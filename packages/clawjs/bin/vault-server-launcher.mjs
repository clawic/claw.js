// Launcher for `claw open vault`. Starts the bundled Vault server. The
// vault server source lives in `vault/` (workspace sibling) and is
// bundled by the Clawix Mac packaging step into the same dir as this
// launcher; in dev mode (running from the workspace) we resolve via the
// sibling path.

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

function findServerEntry() {
  const candidates = [
    path.join(HERE, "vault-server.mjs"),                                       // co-located after Mac bundling
    path.join(HERE, "../vault-server/dist/server.js"),                         // packed monorepo dep
    path.join(HERE, "../../../vault/dist/server.js"),                          // dev: built once
    path.join(HERE, "../../../vault/src/bin/server.ts"),                       // dev: tsx fallback
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

export async function runOpenVault(args) {
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

  if (flags.port) process.env.VAULT_PORT = flags.port;
  if (flags.host) process.env.VAULT_HOST = flags.host;
  if (flags.workspace) {
    process.env.VAULT_DATA_DIR = flags.workspace;
    process.env.VAULT_DB_PATH = path.join(flags.workspace, "vault.sqlite");
  }

  const entry = findServerEntry();
  if (!entry) {
    console.error("[claw open vault] could not locate the vault server entrypoint.");
    console.error("Expected one of:");
    console.error("  - <cli>/bin/vault-server.mjs (bundled)");
    console.error("  - clawjs/vault/dist/server.js (built)");
    console.error("  - clawjs/vault/src/bin/server.ts (dev, requires tsx)");
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

  if (entry.endsWith("/vault/dist/server.js")) {
    const { spawn } = await import("node:child_process");
    const child = spawn(process.execPath, [entry, ...args], {
      stdio: "inherit",
      env: { ...process.env },
    });
    return await new Promise((resolve) => child.on("close", (code) => resolve(code ?? 1)));
  }

  const mod = await import(pathToFileURL(entry).href);
  if (mod && typeof mod.startVaultServer === "function") {
    const overrides = {};
    if (flags.port) overrides.config = { ...(overrides.config ?? {}), port: Number(flags.port) };
    if (flags.host) overrides.config = { ...(overrides.config ?? {}), host: flags.host };
    if (flags.workspace) {
      overrides.config = {
        ...(overrides.config ?? {}),
        dataDir: flags.workspace,
        dbPath: path.join(flags.workspace, "vault.sqlite"),
      };
    }
    if (flags["status-file"]) overrides.statusFile = flags["status-file"];
    const { config } = await mod.startVaultServer(overrides);
    console.log(`[vault] listening on ${config.host}:${config.port}`);
    return 0;
  }

  console.error("[claw open vault] entry does not export startVaultServer().");
  return 1;
}
