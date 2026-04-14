import test from "node:test";
import assert from "node:assert/strict";

import {
  buildOpenClawCommand,
  withOpenClawCommandEnv,
} from "./openclaw-command.ts";

test("withOpenClawCommandEnv injects canonical OpenClaw paths when provided", () => {
  const env = withOpenClawCommandEnv({
    NODE_ENV: "test",
  }, {
    binaryPath: "/usr/local/bin/openclaw",
    homeDir: "/tmp/openclaw-state",
    configPath: "/tmp/openclaw-state/openclaw.json",
  });

  assert.equal(env?.NODE_ENV, "test");
  assert.equal(env?.CLAWJS_OPENCLAW_PATH, "/usr/local/bin/openclaw");
  assert.equal(env?.OPENCLAW_STATE_DIR, "/tmp/openclaw-state");
  assert.equal(env?.OPENCLAW_CONFIG_PATH, "/tmp/openclaw-state/openclaw.json");
  assert.equal(typeof env?.PATH, "string");
});

test("withOpenClawCommandEnv preserves explicit env overrides", () => {
  const env = withOpenClawCommandEnv({
    OPENCLAW_STATE_DIR: "/custom/state",
    OPENCLAW_CONFIG_PATH: "/custom/config.json",
  }, {
    homeDir: "/tmp/openclaw-state",
    configPath: "/tmp/openclaw-state/openclaw.json",
  });

  assert.equal(env?.OPENCLAW_STATE_DIR, "/custom/state");
  assert.equal(env?.OPENCLAW_CONFIG_PATH, "/custom/config.json");
  assert.equal(typeof env?.PATH, "string");
});

test("buildOpenClawCommand forwards canonical env to subprocesses", () => {
  const command = buildOpenClawCommand(["models", "status", "--json"], {
    homeDir: "/tmp/openclaw-state",
    configPath: "/tmp/openclaw-state/openclaw.json",
  });

  assert.equal(command.command, "openclaw");
  assert.deepEqual(command.args, ["models", "status", "--json"]);
  assert.equal(command.env?.OPENCLAW_STATE_DIR, "/tmp/openclaw-state");
  assert.equal(command.env?.OPENCLAW_CONFIG_PATH, "/tmp/openclaw-state/openclaw.json");
  assert.equal(typeof command.env?.PATH, "string");
});

test("buildOpenClawCommand preserves PATH when only canonical config is provided", () => {
  const previousPath = process.env.PATH;
  process.env.PATH = "/tmp/fake-bin";
  try {
    const command = buildOpenClawCommand(["gateway", "status"], {
      configPath: "/tmp/openclaw-state/openclaw.json",
    });
    assert.equal(command.env?.OPENCLAW_CONFIG_PATH, "/tmp/openclaw-state/openclaw.json");
    assert.equal(command.env?.PATH, "/tmp/fake-bin");
  } finally {
    process.env.PATH = previousPath;
  }
});
