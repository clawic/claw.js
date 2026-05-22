import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import { resolveClawGlobalDataStorageDir } from "@clawjs/core";

import { loadMCPConfig } from "./config.ts";
import { systemTelemetryMonitorDbPath } from "./system-telemetry.ts";

test("MCP global data fallback uses the central global data storage helper", () => {
  const source = fs.readFileSync(new URL("./config.ts", import.meta.url), "utf8");
  assert.equal(resolveClawGlobalDataStorageDir({ homeDir: "/Users/demo" }), "/Users/demo/.claw/data");
  assert.match(source, /resolveClawGlobalDataStorageDir/);
  assert.equal(/path\.join\(expandHome\(process\.env\.CLAW_HOME\), "data"\)/.test(source), false);
  assert.equal(/resolveClawPersistentSurfacePath\("claw\.global\.data"\)/.test(source), false);
  assert.equal(/clawGlobalHomeLayout[.]data/.test(source), false);
});

test("MCP config preserves shared global data override precedence", () => {
  withPatchedEnv(
    {
      CLAW_DATA_DIR: path.join(os.tmpdir(), "mcp-data-dir"),
      CLAW_HOME: path.join(os.tmpdir(), "mcp-claw-home"),
      MCP_DATA_DIR: undefined,
    },
    () => {
      assert.equal(loadMCPConfig().dataDir, path.join(os.tmpdir(), "mcp-data-dir"));
    },
  );

  withPatchedEnv(
    {
      CLAW_DATA_DIR: undefined,
      CLAW_HOME: path.join(os.tmpdir(), "mcp-claw-home"),
      MCP_DATA_DIR: undefined,
    },
    () => {
      assert.equal(loadMCPConfig().dataDir, path.join(os.tmpdir(), "mcp-claw-home", "data"));
    },
  );
});

test("MCP system telemetry monitor database fallback uses the central data helper", () => {
  const source = fs.readFileSync(new URL("./system-telemetry.ts", import.meta.url), "utf8");
  assert.match(source, /resolveClawGlobalDataStorageDir/);
  assert.equal(/path\.join\(expandHome\(process\.env\.CLAW_HOME\), "data", "monitor\.sqlite"\)/.test(source), false);
  assert.equal(/resolveClawPersistentSurfacePath\("claw\.database\.monitor"\)/.test(source), false);

  withPatchedEnv(
    {
      CLAW_MONITOR_DB_PATH: undefined,
      CLAW_MONITOR_DATA_DIR: undefined,
      CLAW_DATA_DIR: path.join(os.tmpdir(), "mcp-monitor-data"),
      CLAW_HOME: path.join(os.tmpdir(), "mcp-monitor-home"),
    },
    () => {
      assert.equal(systemTelemetryMonitorDbPath(), path.join(os.tmpdir(), "mcp-monitor-data", "monitor.sqlite"));
    },
  );
});

test("MCP system telemetry monitor database path expands exact home override", () => {
  const source = fs.readFileSync(new URL("./system-telemetry.ts", import.meta.url), "utf8");
  assert.match(source, /expandClawHomePath/);
  assert.equal(/function\s+expandHome/.test(source), false);
  assert.equal(/path\.join\(os\.homedir\(\), value\.slice\(2\)\)/.test(source), false);

  withPatchedEnv(
    {
      CLAW_MONITOR_DB_PATH: "~",
      CLAW_MONITOR_DATA_DIR: undefined,
      CLAW_DATA_DIR: undefined,
      CLAW_HOME: undefined,
    },
    () => {
      assert.equal(systemTelemetryMonitorDbPath(), os.homedir());
    },
  );

  withPatchedEnv(
    {
      CLAW_MONITOR_DB_PATH: undefined,
      CLAW_MONITOR_DATA_DIR: "~/monitor-data",
      CLAW_DATA_DIR: undefined,
      CLAW_HOME: undefined,
    },
    () => {
      assert.equal(systemTelemetryMonitorDbPath(), path.join(os.homedir(), "monitor-data", "monitor.sqlite"));
    },
  );
});

function withPatchedEnv<TValue>(env: Record<string, string | undefined>, fn: () => TValue): TValue {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(env)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}
