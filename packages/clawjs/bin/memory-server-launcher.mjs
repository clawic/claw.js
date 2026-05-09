// Launcher for `claw open memory`. Starts the bundled Memory server. The
// memory server source lives in `memory/` (workspace sibling) and is bundled
// into the same dir as this launcher; in dev mode (running from the
// workspace) we resolve via the sibling path.

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

function findServerEntry() {
  const candidates = [
    path.join(HERE, "memory-server.mjs"),                              // co-located after Mac bundling
    path.join(HERE, "../memory-server/dist/server.js"),                // packed monorepo dep
    path.join(HERE, "../../../memory/dist/server.js"),                 // dev: built once
    path.join(HERE, "../../../memory/src/server.ts"),                  // dev: tsx fallback
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

export async function runOpenMemory(args) {
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

  if (flags.port) process.env.MEMORY_PORT = flags.port;
  if (flags.host) process.env.MEMORY_HOST = flags.host;
  if (flags.workspace) process.env.MEMORY_WORKSPACE = flags.workspace;

  const entry = findServerEntry();
  if (!entry) {
    console.error("[claw open memory] could not locate the memory server entrypoint.");
    console.error("Expected one of:");
    console.error("  - <cli>/bin/memory-server.mjs (bundled)");
    console.error("  - clawjs/memory/dist/server.js (built)");
    console.error("  - clawjs/memory/src/server.ts (dev, requires tsx)");
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
  if (mod && typeof mod.startMemoryServer === "function") {
    const overrides = {};
    if (flags.port) overrides.port = Number(flags.port);
    if (flags.host) overrides.host = flags.host;
    if (flags.workspace) overrides.workspace = flags.workspace;
    if (flags["status-file"]) overrides.statusFile = flags["status-file"];
    const { config } = mod.startMemoryServer(overrides);
    console.log(`[memory] listening on ${config.host}:${config.port} workspace=${config.workspace}`);
    return new Promise(() => {}); // keep process alive while server runs
  }

  console.error("[claw open memory] entry does not export startMemoryServer().");
  return 1;
}
