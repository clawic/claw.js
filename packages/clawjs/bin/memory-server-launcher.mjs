// Launcher for `claw open memory`. Starts the bundled Memory server. The
// memory server source lives in `memory/` (workspace sibling) and is bundled
// into the same dir as this launcher; in dev mode (running from the
// workspace) we resolve via the sibling path.

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createLauncherDiagnostic, printLauncherFailure } from "./launcher-diagnostics.mjs";

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

function printOpenMemoryFailure(diagnostic) {
  printLauncherFailure("claw open memory failed:", [diagnostic]);
}

function runOpenMemorySelfTest() {
  const chunks = [];
  printLauncherFailure("claw open memory failed for /Users/example/private", [
    createLauncherDiagnostic("claw_open_memory_entry_missing", "token: sk-test-secret-123456", {
      location: "/Users/example/private/memory",
      suggestion: "Build the memory package that provides the server entrypoint.",
      safeNextStep: "Run npm --workspace @clawjs/memory run build, then rerun claw open memory.",
    }),
  ], { write: (chunk) => chunks.push(chunk) });
  const output = chunks.join("");
  if (!output.includes("code: claw_open_memory_entry_missing")) throw new Error("self-test missing stable code");
  if (!output.includes("suggestion: Build the memory package that provides the server entrypoint.")) throw new Error("self-test missing suggestion");
  if (!output.includes("next: Run npm --workspace @clawjs/memory run build, then rerun claw open memory.")) throw new Error("self-test missing next step");
  if (output.includes("/Users/example") || output.includes("sk-test-secret-123456")) throw new Error("self-test leaked private data");
  console.log("memory launcher diagnostics self-test passed");
}

export async function runOpenMemory(args) {
  if (args.includes("--self-test")) {
    runOpenMemorySelfTest();
    return 0;
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

  if (flags.port) process.env.CLAW_MEMORY_PORT = flags.port;
  if (flags.host) process.env.CLAW_MEMORY_HOST = flags.host;
  if (flags.workspace) process.env.CLAW_MEMORY_WORKSPACE = flags.workspace;

  const entry = findServerEntry();
  if (!entry) {
    printOpenMemoryFailure(createLauncherDiagnostic(
      "claw_open_memory_entry_missing",
      "Could not locate the memory server entrypoint.",
      {
        location: "packages/clawjs/bin/memory-server-launcher.mjs",
        suggestion: "Build or bundle one of the supported memory server entrypoints.",
        safeNextStep: "Run npm --workspace @clawjs/memory run build, then rerun claw open memory.",
      },
    ));
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

  printOpenMemoryFailure(createLauncherDiagnostic(
    "claw_open_memory_export_missing",
    "Memory server entry does not export startMemoryServer().",
    {
      location: "startMemoryServer",
      suggestion: "Use a memory server build that exports startMemoryServer().",
      safeNextStep: "Rebuild the memory package, then rerun claw open memory.",
    },
  ));
  return 1;
}
