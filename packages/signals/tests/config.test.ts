import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import { resolveClawGlobalDataStorageDir } from "@clawjs/core";

import { loadSignalsServiceConfig } from "../src/config.ts";

test("signals global data fallback uses the central global data storage helper", () => {
  const source = fs.readFileSync(new URL("../src/config.ts", import.meta.url), "utf8");

  assert.equal(resolveClawGlobalDataStorageDir({ homeDir: "/Users/demo" }), "/Users/demo/.claw/data");
  assert.match(source, /resolveClawGlobalDataStorageDir/);
  assert.equal(/path\.join\(expandHome\(process\.env\.CLAW_HOME\), "data"\)/.test(source), false);
  assert.equal(/resolveClawPersistentSurfacePath\("claw\.global\.data"\)/.test(source), false);
  assert.equal(/resolveClawPersistentSurfacePath\("claw\.global\.root"\)/.test(source), false);
  assert.equal(/clawGlobalHomeLayout[.]root/.test(source), false);
  assert.equal(/return path[.]join\(home, "data"\)/.test(source), false);
});

test("signals config preserves service and shared global data override precedence", () => {
  withPatchedEnv(
    {
      SIGNALS_DATA_DIR: path.join(os.tmpdir(), "signals-service-data"),
      CLAW_DATA_DIR: path.join(os.tmpdir(), "signals-shared-data"),
      CLAW_HOME: path.join(os.tmpdir(), "signals-home"),
    },
    () => {
      assert.equal(
        loadSignalsServiceConfig({
          domain: "signals",
          defaultPort: 24110,
        }).dataDir,
        path.join(os.tmpdir(), "signals-service-data"),
      );
    },
  );

  withPatchedEnv(
    {
      SIGNALS_DATA_DIR: undefined,
      CLAW_DATA_DIR: path.join(os.tmpdir(), "signals-shared-data"),
      CLAW_HOME: path.join(os.tmpdir(), "signals-home"),
    },
    () => {
      assert.equal(
        loadSignalsServiceConfig({
          domain: "signals",
          defaultPort: 24110,
        }).dataDir,
        path.join(os.tmpdir(), "signals-shared-data"),
      );
    },
  );

  withPatchedEnv(
    {
      SIGNALS_DATA_DIR: undefined,
      CLAW_DATA_DIR: undefined,
      CLAW_HOME: path.join(os.tmpdir(), "signals-home"),
    },
    () => {
      assert.equal(
        loadSignalsServiceConfig({
          domain: "signals",
          defaultPort: 24110,
        }).dataDir,
        path.join(os.tmpdir(), "signals-home", "data"),
      );
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
