import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import { resolveClawGlobalDataStorageDir } from "@clawjs/core";

import { ChannelApiClient, loadChannelConfig } from "./index.ts";

test("channel base global data fallback uses the central global data storage helper", () => {
  const source = fs.readFileSync(new URL("./index.ts", import.meta.url), "utf8");
  assert.equal(resolveClawGlobalDataStorageDir({ homeDir: "/Users/demo" }), "/Users/demo/.claw/data");
  assert.match(source, /resolveClawGlobalDataStorageDir/);
  assert.equal(/path\.join\(expandHome\(process\.env\.CLAW_HOME\), "data"\)/.test(source), false);
  assert.equal(/resolveClawPersistentSurfacePath\("claw\.global\.data"\)/.test(source), false);
  assert.equal(/resolveClawPersistentSurfacePath\("claw[.]global[.]root"\)/.test(source), false);
});

test("channel base preserves channel-specific and shared global data override precedence", () => {
  withPatchedEnv(
    {
      TELEGRAM_DATA_DIR: path.join(os.tmpdir(), "channel-telegram-data"),
      CLAW_DATA_DIR: path.join(os.tmpdir(), "channel-shared-data"),
      CLAW_HOME: path.join(os.tmpdir(), "channel-home"),
    },
    () => {
      assert.equal(loadChannelConfig("telegram").dataDir, path.join(os.tmpdir(), "channel-telegram-data"));
    },
  );

  withPatchedEnv(
    {
      TELEGRAM_DATA_DIR: undefined,
      CLAW_DATA_DIR: path.join(os.tmpdir(), "channel-shared-data"),
      CLAW_HOME: path.join(os.tmpdir(), "channel-home"),
    },
    () => {
      assert.equal(loadChannelConfig("telegram").dataDir, path.join(os.tmpdir(), "channel-shared-data"));
    },
  );

  withPatchedEnv(
    {
      TELEGRAM_DATA_DIR: undefined,
      CLAW_DATA_DIR: undefined,
      CLAW_HOME: path.join(os.tmpdir(), "channel-home"),
    },
    () => {
      assert.equal(loadChannelConfig("telegram").dataDir, path.join(os.tmpdir(), "channel-home", "data"));
    },
  );
});

test("channel api client reports malformed success JSON with request context", async () => {
  const client = new ChannelApiClient({
    channel: "telegram",
    baseUrl: "https://channel.example.invalid",
    token: "secret",
    fetchImpl: async () => new Response("{\"items\":", {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  });

  await assert.rejects(
    () => client.listAccounts(),
    (error) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /telegram api GET \/v1\/telegram\/accounts -> malformed JSON response/);
      return true;
    },
  );
});

test("channel api client rejects oversized success JSON before parsing", async () => {
  const client = new ChannelApiClient({
    channel: "telegram",
    baseUrl: "https://channel.example.invalid",
    token: "secret",
    fetchImpl: async () => new Response("x".repeat((4 * 1024 * 1024) + 1), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  });

  await assert.rejects(
    () => client.listAccounts(),
    (error) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /telegram api GET \/v1\/telegram\/accounts -> JSON response too large/);
      return true;
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
