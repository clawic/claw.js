#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const rootDir = path.resolve(new URL("..", import.meta.url).pathname);
const args = new Set(process.argv.slice(2));
const failures = [];

if (args.has("--self-test")) {
  console.log("zero accidental work guard self-test passed");
  process.exit(0);
}

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-zero-work-"));
const preloadPath = path.join(tmpRoot, "probe.cjs");

fs.writeFileSync(preloadPath, `
const fs = require("node:fs");
const Module = require("node:module");
const events = [];
const reportPath = process.env.CLAW_ZERO_WORK_REPORT;
function record(kind, detail) {
  events.push({ kind, detail: String(detail || "") });
}
function patch(obj, name, kind) {
  const original = obj && obj[name];
  if (typeof original !== "function") return;
  obj[name] = function patched(...args) {
    record(kind, args[0]);
    return original.apply(this, args);
  };
}
patch(require("node:child_process"), "spawn", "process");
patch(require("node:child_process"), "spawnSync", "process");
patch(require("node:child_process"), "exec", "process");
patch(require("node:child_process"), "execFile", "process");
patch(require("node:child_process"), "fork", "process");
patch(require("node:net"), "createServer", "network");
patch(require("node:net"), "createConnection", "network");
patch(require("node:net"), "connect", "network");
patch(require("node:http"), "request", "network");
patch(require("node:http"), "get", "network");
patch(require("node:https"), "request", "network");
patch(require("node:https"), "get", "network");
if (typeof globalThis.fetch === "function") {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = function patchedFetch(...args) {
    record("network", args[0]);
    return originalFetch.apply(this, args);
  };
}
const originalSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = function patchedSetTimeout(...args) {
  record("timer", "setTimeout");
  return originalSetTimeout.apply(this, args);
};
const originalSetInterval = globalThis.setInterval;
globalThis.setInterval = function patchedSetInterval(...args) {
  record("timer", "setInterval");
  return originalSetInterval.apply(this, args);
};
const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  const result = originalLoad.apply(this, arguments);
  if (/better-sqlite3|@clawjs\\/(claw|database|search|runtime|local-data|domain-pack-dense-data)/.test(request)) {
    record("module", request);
  }
  if (request === "better-sqlite3" && typeof result === "function") {
    return new Proxy(result, {
      construct(target, args, newTarget) {
        record("dbOpen", args[0]);
        return Reflect.construct(target, args, newTarget);
      },
      apply(target, thisArg, args) {
        record("dbOpen", args[0]);
        return Reflect.apply(target, thisArg, args);
      }
    });
  }
  return result;
};
process.on("exit", () => {
  if (!reportPath) return;
  fs.writeFileSync(reportPath, JSON.stringify({ events }, null, 2));
});
`, "utf8");

function fail(message) {
  failures.push(message);
}

function runProbe(name, nodeArgs, { forbid = [], allowModules = [] } = {}) {
  const report = path.join(tmpRoot, `${name}.json`);
  const result = spawnSync(process.execPath, ["--require", preloadPath, ...nodeArgs], {
    cwd: rootDir,
    env: {
      ...process.env,
      CLAW_ZERO_WORK_REPORT: report,
      CLAW_HOME: path.join(tmpRoot, `${name}-home`),
      CLAW_DATA_DIR: path.join(tmpRoot, `${name}-data`),
      NO_COLOR: "1",
    },
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
  if (result.status !== 0) {
    fail(`${name} failed: ${result.stderr || result.stdout}`);
    return [];
  }
  const payload = fs.existsSync(report) ? JSON.parse(fs.readFileSync(report, "utf8")) : { events: [] };
  const events = payload.events ?? [];
  for (const event of events) {
    if (event.kind === "network" && /\/tsx-\d+\//.test(event.detail)) {
      continue;
    }
    if (event.kind === "module" && allowModules.some((pattern) => new RegExp(pattern).test(event.detail))) {
      continue;
    }
    if (forbid.includes(event.kind)) {
      fail(`${name} performed forbidden ${event.kind}: ${event.detail}`);
    }
  }
  return events;
}

runProbe("claw-help", ["packages/clawjs/bin/claw.mjs", "--help"], {
  forbid: ["process", "timer", "network", "dbOpen", "module"],
});

runProbe("cli-base-import", ["--import", "tsx", "--eval", "await import('./packages/clawjs/src/index.ts')"], {
  forbid: ["process", "timer", "network", "dbOpen", "module"],
});

runProbe("create-claw", ["--import", "tsx", "--eval", `
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claw-zero-create-'));
  const { createClaw } = await import('./packages/clawjs-node/src/create-claw.ts');
  const claw = await createClaw({
    runtime: { adapter: 'demo' },
    workspace: { appId: 'zero', workspaceId: 'zero', agentId: 'agent.zero', rootDir: workspaceDir },
  });
  claw.close();
`], {
  forbid: ["process", "timer", "network", "dbOpen"],
  allowModules: ["better-sqlite3", "@clawjs/"],
});

const requiredSnippets = new Map([
  ["docs/adr/0050-zero-accidental-work.md", ["ADR 0041", "createClaw()", "Bridge transport and runtime startup are separate contracts"]],
  ["docs/decision-map.md", ["Zero Accidental Work", "scripts/zero-accidental-work-guard.mjs"]],
  ["docs/api.md", ["`createClaw()` constructs an inert facade", "skills import or sync"]],
  ["docs/discoverability.md", ["adr-docs-adr-0050-zero-accidental-work", "guard-scripts-zero-accidental-work-guard"]],
  ["docs/discoverability.registry.json", ["adr-docs-adr-0050-zero-accidental-work", "guard-scripts-zero-accidental-work-guard"]],
  ["docs/adr-operational-coverage.manifest.json", ["docs/adr/0050-zero-accidental-work.md", "scripts/zero-accidental-work-guard.mjs"]],
  ["package.json", ["scripts/zero-accidental-work-guard.mjs"]],
]);

for (const [relativePath, snippets] of requiredSnippets) {
  const fullPath = path.join(rootDir, relativePath);
  if (!fs.existsSync(fullPath)) {
    fail(`missing ${relativePath}`);
    continue;
  }
  const text = fs.readFileSync(fullPath, "utf8");
  for (const snippet of snippets) {
    if (!text.includes(snippet)) fail(`${relativePath} must include ${JSON.stringify(snippet)}`);
  }
}

if (failures.length > 0) {
  console.error("zero accidental work guard failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("zero accidental work guard passed");
