import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import { resolveClawGlobalDataStorageDir } from "@clawjs/core";

import { loadDatabaseConfig } from "./config.ts";

test("database global data fallback uses the central global data storage helper", () => {
  const source = fs.readFileSync(new URL("./config.ts", import.meta.url), "utf8");
  assert.equal(resolveClawGlobalDataStorageDir({ homeDir: "/Users/demo" }), "/Users/demo/.claw/data");
  assert.match(source, /resolveClawGlobalDataStorageDir/);
  assert.equal(/path\.join\(expandHome\(process\.env\.CLAW_HOME\), "data"\)/.test(source), false);
  assert.equal(/resolveClawPersistentSurfacePath\("claw\.global\.data"\)/.test(source), false);
  assert.equal(/clawGlobalHomeLayout[.]root/.test(source), false);
});

test("database config preserves service and shared global data override precedence", () => {
  withPatchedEnv(
    {
      CLAW_DATABASE_DATA_DIR: path.join(os.tmpdir(), "database-service-data"),
      CLAW_DATA_DIR: path.join(os.tmpdir(), "database-shared-data"),
      CLAW_HOME: path.join(os.tmpdir(), "database-home"),
    },
    () => {
      assert.equal(loadDatabaseConfig().dataDir, path.join(os.tmpdir(), "database-service-data"));
    },
  );

  withPatchedEnv(
    {
      CLAW_DATABASE_DATA_DIR: undefined,
      CLAW_DATA_DIR: path.join(os.tmpdir(), "database-shared-data"),
      CLAW_HOME: path.join(os.tmpdir(), "database-home"),
    },
    () => {
      assert.equal(loadDatabaseConfig().dataDir, path.join(os.tmpdir(), "database-shared-data"));
    },
  );

  withPatchedEnv(
    {
      CLAW_DATABASE_DATA_DIR: undefined,
      CLAW_DATA_DIR: undefined,
      CLAW_HOME: path.join(os.tmpdir(), "database-home"),
    },
    () => {
      assert.equal(loadDatabaseConfig().dataDir, path.join(os.tmpdir(), "database-home", "data"));
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
