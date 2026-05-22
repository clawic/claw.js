import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import { resolveClawGlobalDataStorageDir } from "@clawjs/core";

import { loadVoiceConfig } from "./config.ts";

test("voice global data fallback uses the central global data storage helper", () => {
  const source = fs.readFileSync(new URL("./config.ts", import.meta.url), "utf8");
  assert.equal(resolveClawGlobalDataStorageDir({ homeDir: "/Users/demo" }), "/Users/demo/.claw/data");
  assert.match(source, /resolveClawGlobalDataStorageDir/);
  assert.equal(/path\.join\(expandHome\(process\.env\.CLAW_HOME\), "data"\)/.test(source), false);
  assert.equal(/resolveClawPersistentSurfacePath\("claw\.global\.data"\)/.test(source), false);
  assert.equal(/clawGlobalHomeLayout[.]data/.test(source), false);
});

test("voice config preserves service and shared global data override precedence", () => {
  withPatchedEnv(
    {
      VOICE_DATA_DIR: path.join(os.tmpdir(), "voice-service-data"),
      CLAW_DATA_DIR: path.join(os.tmpdir(), "voice-shared-data"),
      CLAW_HOME: path.join(os.tmpdir(), "voice-home"),
    },
    () => {
      assert.equal(loadVoiceConfig().dataDir, path.join(os.tmpdir(), "voice-service-data"));
    },
  );

  withPatchedEnv(
    {
      VOICE_DATA_DIR: undefined,
      CLAW_DATA_DIR: path.join(os.tmpdir(), "voice-shared-data"),
      CLAW_HOME: path.join(os.tmpdir(), "voice-home"),
    },
    () => {
      assert.equal(loadVoiceConfig().dataDir, path.join(os.tmpdir(), "voice-shared-data"));
    },
  );

  withPatchedEnv(
    {
      VOICE_DATA_DIR: undefined,
      CLAW_DATA_DIR: undefined,
      CLAW_HOME: path.join(os.tmpdir(), "voice-home"),
    },
    () => {
      assert.equal(loadVoiceConfig().dataDir, path.join(os.tmpdir(), "voice-home", "data"));
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
