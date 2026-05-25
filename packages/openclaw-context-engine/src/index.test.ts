// @ts-nocheck
import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";

import plugin, { ENGINE_ID, resetClawJsContextEngineStateForTests } from "./index.js";

test("context engine package exposes native manifest and extension entry", () => {
  const root = path.dirname(new URL(import.meta.url).pathname);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "..", "openclaw.plugin.json"), "utf8"));
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "..", "package.json"), "utf8"));

  assert.equal(manifest.id, ENGINE_ID);
  assert.equal(manifest.kind, "context-engine");
  assert.equal(manifest.supportLevel, "dev-only");
  assert.equal(packageJson.description.includes("Experimental"), false);
  assert.deepEqual(packageJson.openclaw.extensions, ["./src/index.js"]);
});

test("register exposes the context engine factory", async () => {
  resetClawJsContextEngineStateForTests();
  let engineId = null;
  let factory = null;

  plugin.register({
    pluginConfig: {
      systemPromptAddition: "Use ClawJS context.",
    },
    registerContextEngine(id, value) {
      engineId = id;
      factory = value;
    },
  });

  assert.equal(engineId, ENGINE_ID);
  assert.equal(typeof factory, "function");

  const engine = await factory();
  const assembled = await engine.assemble({ messages: [{ role: "user", content: "hello" }] });
  const compacted = await engine.compact({});

  assert.equal(engine.info.id, ENGINE_ID);
  assert.equal(plugin.supportLevel, "dev-only");
  assert.equal(assembled.systemPromptAddition, "Use ClawJS context.");
  assert.equal(compacted.ok, true);
  assert.equal(compacted.compacted, false);
});

test("context engine assemble tolerates invalid message payloads", async () => {
  resetClawJsContextEngineStateForTests();
  let factory = null;

  plugin.register({
    registerContextEngine(_id, value) {
      factory = value;
    },
  });

  const engine = await factory();
  const assembled = await engine.assemble({ messages: "interrupted-payload" });

  assert.deepEqual(assembled.messages, []);
  assert.equal(assembled.estimatedTokens, 0);
});
