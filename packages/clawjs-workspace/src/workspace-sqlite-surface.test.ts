import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import { resolveClawGlobalDataStorageDir } from "@clawjs/core";

import { resolveWorkspaceSqliteDatabasePath } from "./workspace-sqlite-surface.ts";

test("workspace sqlite global data fallback uses the central global data storage helper", () => {
  const source = fs.readFileSync(new URL("./workspace-sqlite-surface.ts", import.meta.url), "utf8");

  assert.equal(resolveClawGlobalDataStorageDir({ homeDir: "/Users/demo" }), "/Users/demo/.claw/data");
  assert.match(source, /resolveClawGlobalDataStorageDir/);
  assert.equal(/resolveClawPersistentSurfacePath\("claw\.global\.data"\)/.test(source), false);
  assert.equal(/path[.]join\(expandHome\(process[.]env[.]CLAW_HOME\), "data", "core[.]sqlite"\)/.test(source), false);
  assert.equal(/clawGlobalHomeLayout[.]data/.test(source), false);
});

test("workspace sqlite preserves db, home, and shared data override precedence", () => {
  withPatchedEnv(
    {
      CLAW_DB_PATH: path.join(os.tmpdir(), "workspace-explicit.sqlite"),
      CLAW_HOME: path.join(os.tmpdir(), "workspace-home"),
      CLAW_DATA_DIR: path.join(os.tmpdir(), "workspace-data"),
    },
    () => {
      assert.equal(resolveWorkspaceSqliteDatabasePath(), path.join(os.tmpdir(), "workspace-explicit.sqlite"));
    },
  );

  withPatchedEnv(
    {
      CLAW_DB_PATH: undefined,
      CLAW_HOME: path.join(os.tmpdir(), "workspace-home"),
      CLAW_DATA_DIR: path.join(os.tmpdir(), "workspace-data"),
    },
    () => {
      assert.equal(resolveWorkspaceSqliteDatabasePath(), path.join(os.tmpdir(), "workspace-home", "data", "core.sqlite"));
    },
  );

  withPatchedEnv(
    {
      CLAW_DB_PATH: undefined,
      CLAW_HOME: undefined,
      CLAW_DATA_DIR: path.join(os.tmpdir(), "workspace-data"),
    },
    () => {
      assert.equal(resolveWorkspaceSqliteDatabasePath(), path.join(os.tmpdir(), "workspace-data", "core.sqlite"));
    },
  );
});

test("workspace sqlite explicit db path uses the shared core home expansion helper", () => {
  withPatchedEnv(
    {
      CLAW_DB_PATH: "~",
      CLAW_HOME: undefined,
      CLAW_DATA_DIR: undefined,
    },
    () => {
      assert.equal(resolveWorkspaceSqliteDatabasePath(), os.homedir());
    },
  );

  withPatchedEnv(
    {
      CLAW_DB_PATH: "~/workspace-explicit.sqlite",
      CLAW_HOME: undefined,
      CLAW_DATA_DIR: undefined,
    },
    () => {
      assert.equal(resolveWorkspaceSqliteDatabasePath(), path.join(os.homedir(), "workspace-explicit.sqlite"));
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
