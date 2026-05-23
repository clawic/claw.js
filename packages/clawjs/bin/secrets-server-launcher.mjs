// Launcher for `claw open secrets`. Starts the bundled Secrets server. The
// secrets server source lives in `secrets/` (workspace sibling) and is
// bundled by the Clawix Mac packaging step into the same dir as this
// launcher; in dev mode (running from the workspace) we resolve via the
// sibling path.

import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolveClawGlobalDataStorageDir } from "@clawjs/core";
import { createLauncherDiagnostic, printLauncherFailure } from "./launcher-diagnostics.mjs";

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

function defaultClawjsDataRoot(flags) {
  const explicit = flags["data-dir"] ?? process.env.CLAW_SECRETS_DATA_DIR ?? process.env.CLAW_DATA_DIR;
  if (explicit) return path.resolve(resolveClawGlobalDataStorageDir({ homeDir: os.homedir(), dataDir: explicit }));
  const clawHome = process.env.CLAW_HOME;
  return resolveClawGlobalDataStorageDir({
    homeDir: os.homedir(),
    ...(clawHome ? { clawHome } : {}),
  });
}

async function readBootstrapConfigFromStdin() {
  if (process.env.CLAW_SECRETS_BOOTSTRAP_STDIN !== "1") return null;
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) throw new Error("CLAW_SECRETS_BOOTSTRAP_STDIN was set but no bootstrap payload was received");
  const parsed = JSON.parse(raw);
  const adminToken = typeof parsed.adminToken === "string" && parsed.adminToken.length > 0 ? parsed.adminToken : undefined;
  const signedHostToken = typeof parsed.signedHostToken === "string" && parsed.signedHostToken.length > 0 ? parsed.signedHostToken : undefined;
  const kekBase64 = typeof parsed.kekBase64 === "string" && parsed.kekBase64.length > 0 ? parsed.kekBase64 : undefined;
  return { ...(adminToken ? { adminToken } : {}), ...(signedHostToken ? { signedHostToken } : {}), ...(kekBase64 ? { kekBase64 } : {}) };
}

function printOpenSecretsFailure(diagnostic) {
  printLauncherFailure("claw open secrets failed:", [diagnostic]);
}

function envForChildBootstrap() {
  const env = { ...process.env };
  delete env.CLAW_SECRETS_ADMIN_TOKEN;
  delete env.CLAW_SECRETS_TOKEN;
  delete env.CLAW_SECRETS_SIGNED_HOST_TOKEN;
  delete env.CLAW_SECRETS_KEK_BASE64;
  env.CLAW_SECRETS_BOOTSTRAP_STDIN = "1";
  return env;
}

function writeBootstrapToChild(child, bootstrapConfig) {
  child.stdin.end(`${JSON.stringify(bootstrapConfig)}\n`);
}

export async function runOpenSecrets(args) {
  let bootstrapConfig;
  try {
    bootstrapConfig = await readBootstrapConfigFromStdin();
  } catch {
    printOpenSecretsFailure(createLauncherDiagnostic(
      "claw_open_secrets_bootstrap_invalid",
      "Bootstrap payload was missing or invalid.",
      {
        location: "CLAW_SECRETS_BOOTSTRAP_STDIN",
        suggestion: "Send a non-empty JSON bootstrap payload on stdin, or unset CLAW_SECRETS_BOOTSTRAP_STDIN.",
        safeNextStep: "Rerun claw open secrets through the signed host launcher so secrets are passed over stdin.",
      },
    ));
    return 1;
  }
  if (bootstrapConfig) {
    delete process.env.CLAW_SECRETS_ADMIN_TOKEN;
    delete process.env.CLAW_SECRETS_TOKEN;
    delete process.env.CLAW_SECRETS_SIGNED_HOST_TOKEN;
    delete process.env.CLAW_SECRETS_KEK_BASE64;
  }

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

  if (flags.port) process.env.CLAW_SECRETS_PORT = flags.port;
  if (flags.host) process.env.CLAW_SECRETS_HOST = flags.host;
  const dataDir = defaultClawjsDataRoot(flags);
  process.env.CLAW_SECRETS_DATA_DIR = dataDir;
  process.env.CLAW_SECRETS_DB_PATH = flags["db-path"] ?? process.env.CLAW_SECRETS_DB_PATH ?? path.join(dataDir, "vault.sqlite");

  const entry = findServerEntry();
  if (!entry) {
    printOpenSecretsFailure(createLauncherDiagnostic(
      "claw_open_secrets_entry_missing",
      "Could not locate the secrets server entrypoint.",
      {
        location: "packages/clawjs/bin/secrets-server-launcher.mjs",
        suggestion: "Build or bundle one of the supported secrets server entrypoints.",
        safeNextStep: "Run npm --workspace @clawjs/secrets run build, then rerun claw open secrets.",
      },
    ));
    return 1;
  }

  if (entry.endsWith(".ts")) {
    // Dev: spawn tsx for TypeScript entry.
    const { spawn } = await import("node:child_process");
    const tsx = path.join(HERE, "../../../node_modules/.bin/tsx");
    const child = spawn(tsx, [entry, ...args], {
      stdio: bootstrapConfig ? ["pipe", "inherit", "inherit"] : "inherit",
      env: bootstrapConfig ? envForChildBootstrap() : { ...process.env },
    });
    if (bootstrapConfig) writeBootstrapToChild(child, bootstrapConfig);
    return await new Promise((resolve) => child.on("close", (code) => resolve(code ?? 1)));
  }

  if (entry.endsWith("/secrets/dist/server.js")) {
    const { spawn } = await import("node:child_process");
    const child = spawn(process.execPath, [entry, ...args], {
      stdio: bootstrapConfig ? ["pipe", "inherit", "inherit"] : "inherit",
      env: bootstrapConfig ? envForChildBootstrap() : { ...process.env },
    });
    if (bootstrapConfig) writeBootstrapToChild(child, bootstrapConfig);
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
      dbPath: process.env.CLAW_SECRETS_DB_PATH,
      ...(bootstrapConfig ?? {}),
    };
    if (flags["status-file"]) overrides.statusFile = flags["status-file"];
    const { config } = await mod.startSecretsServer(overrides);
    console.log(`[secrets] listening on ${config.host}:${config.port}`);
    return 0;
  }

  printOpenSecretsFailure(createLauncherDiagnostic(
    "claw_open_secrets_export_missing",
    "Secrets server entry does not export startSecretsServer().",
    {
      location: "startSecretsServer",
      suggestion: "Use a secrets server build that exports startSecretsServer().",
      safeNextStep: "Rebuild the secrets package, then rerun claw open secrets.",
    },
  ));
  return 1;
}
