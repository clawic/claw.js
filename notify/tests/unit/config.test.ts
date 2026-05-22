import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { resolveClawGlobalDataStorageDir } from "@clawjs/core";

import { loadNotifyConfig } from "../../src/server/config.ts";

const ROUTE_ENV_NAMES = ["NOTIFY_DATA_DIR", "NOTIFY_DB_PATH", "CLAW_DATA_DIR", "CLAW_HOME"] as const;

function withRouteEnv(env: Partial<Record<(typeof ROUTE_ENV_NAMES)[number], string>>, run: () => void): void {
  const previous = new Map<string, string | undefined>();
  for (const name of ROUTE_ENV_NAMES) {
    previous.set(name, process.env[name]);
    if (Object.prototype.hasOwnProperty.call(env, name)) {
      const value = env[name];
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    } else {
      delete process.env[name];
    }
  }

  try {
    run();
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  }
}

test("notify global data fallback uses the central storage helper", () => {
  const source = fs.readFileSync(new URL("../../src/server/config.ts", import.meta.url), "utf8");
  assert.match(source, /resolveClawGlobalDataStorageDir\(/);
  assert.equal(/resolveClawPersistentSurfacePath\("claw\.global\.data"\)/.test(source), false);
  assert.equal(/path\.join\(expandHome\(process\.env\.CLAW_HOME\), "data"\)/.test(source), false);

  withRouteEnv({}, () => {
    const expectedDataRoot = resolveClawGlobalDataStorageDir({ homeDir: os.homedir() });
    const config = loadNotifyConfig({});
    assert.equal(config.dataDir, expectedDataRoot);
    assert.equal(config.dbPath, path.join(expectedDataRoot, "notify.sqlite"));
  });

  withRouteEnv({ CLAW_HOME: "~/claw-home" }, () => {
    const expectedDataRoot = resolveClawGlobalDataStorageDir({
      homeDir: os.homedir(),
      clawHome: "~/claw-home",
    });
    const config = loadNotifyConfig({});
    assert.equal(config.dataDir, expectedDataRoot);
    assert.equal(config.dbPath, path.join(expectedDataRoot, "notify.sqlite"));
  });

  withRouteEnv({ CLAW_DATA_DIR: "~/claw-data" }, () => {
    const expectedDataRoot = resolveClawGlobalDataStorageDir({
      homeDir: os.homedir(),
      dataDir: "~/claw-data",
    });
    const config = loadNotifyConfig({});
    assert.equal(config.dataDir, expectedDataRoot);
    assert.equal(config.dbPath, path.join(expectedDataRoot, "notify.sqlite"));
  });

  withRouteEnv({ NOTIFY_DATA_DIR: "~/notify-data" }, () => {
    const config = loadNotifyConfig({});
    assert.equal(config.dataDir, "~/notify-data");
    assert.equal(config.dbPath, path.join("~/notify-data", "notify.sqlite"));
  });
});
