import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import { resolveClawGlobalDataStorageDir } from "@clawjs/core";

import { loadSessionsConfig } from "./config.ts";

test("sessions global data fallback uses the central global data storage helper", () => {
  const source = fs.readFileSync(new URL("./config.ts", import.meta.url), "utf8");
  assert.equal(resolveClawGlobalDataStorageDir({ homeDir: "/Users/demo" }), "/Users/demo/.claw/data");
  assert.match(source, /resolveClawGlobalDataStorageDir/);
  assert.equal(/path\.join\(expandHome\(process\.env\.CLAW_HOME\), "data"\)/.test(source), false);
  assert.equal(/resolveClawPersistentSurfacePath\("claw\.global\.data"\)/.test(source), false);
  assert.equal(/clawGlobalHomeLayout[.]data/.test(source), false);
});

test("sessions config preserves service and shared global data override precedence", () => {
  withPatchedEnv(
    {
      CLAW_SESSIONS_DATA_DIR: path.join(os.tmpdir(), "sessions-service-data"),
      CLAW_DATA_DIR: path.join(os.tmpdir(), "sessions-shared-data"),
      CLAW_HOME: path.join(os.tmpdir(), "sessions-home"),
    },
    () => {
      assert.equal(loadSessionsConfig().dataDir, path.join(os.tmpdir(), "sessions-service-data"));
    },
  );

  withPatchedEnv(
    {
      CLAW_SESSIONS_DATA_DIR: undefined,
      CLAW_DATA_DIR: path.join(os.tmpdir(), "sessions-shared-data"),
      CLAW_HOME: path.join(os.tmpdir(), "sessions-home"),
    },
    () => {
      assert.equal(loadSessionsConfig().dataDir, path.join(os.tmpdir(), "sessions-shared-data"));
    },
  );

  withPatchedEnv(
    {
      CLAW_SESSIONS_DATA_DIR: undefined,
      CLAW_DATA_DIR: undefined,
      CLAW_HOME: path.join(os.tmpdir(), "sessions-home"),
    },
    () => {
      assert.equal(loadSessionsConfig().dataDir, path.join(os.tmpdir(), "sessions-home", "data"));
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
