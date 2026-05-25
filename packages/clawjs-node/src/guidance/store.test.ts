import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { test } from "vitest";

import { createLocalGuidanceStore, resolveGuidanceRoot } from "./store.ts";

test("guidance root uses shared surface path home expansion", () => {
  assert.equal(resolveGuidanceRoot({ env: {} }), path.join(os.homedir(), ".claw", "guidance"));
  assert.equal(resolveGuidanceRoot({ rootDir: "~", env: {} }), os.homedir());
  assert.equal(resolveGuidanceRoot({ rootDir: "~/custom-guidance", env: {} }), path.join(os.homedir(), "custom-guidance"));
  assert.equal(resolveGuidanceRoot({ env: { CLAW_GUIDANCE_DIR: "~/env-guidance" } }), path.join(os.homedir(), "env-guidance"));
  assert.equal(resolveGuidanceRoot({ env: { CLAW_HOME: "~/custom-claw" } }), path.join(os.homedir(), "custom-claw", "guidance"));
});

test("guidance cwd prefix matching uses shared home expansion", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-guidance-store-"));
  const store = createLocalGuidanceStore({ rootDir, env: {} });
  const record = store.create({
    title: "Home Project",
    capsule: "Use home scoped guidance.",
    applyWhen: { cwdPrefixes: ["~/project"] },
  });

  const match = store.match({ cwd: path.join(os.homedir(), "project", "app"), limit: 1 });
  assert.deepEqual(match.hints.map((hint) => hint.id), [record.id]);
});

test("guidance store rejects corrupt persisted JSON instead of resetting state", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-guidance-store-corrupt-"));
  const store = createLocalGuidanceStore({ rootDir, env: {} });

  assert.deepEqual(store.readState().records, []);

  const corruptState = "{bad-json";
  fs.mkdirSync(rootDir, { recursive: true });
  fs.writeFileSync(store.statePath(), corruptState, "utf8");

  assert.throws(
    () => store.create({
      title: "Do not overwrite",
      capsule: "Keep corrupt guidance state for recovery.",
    }),
    /Invalid guidance state JSON/,
  );
  assert.equal(fs.readFileSync(store.statePath(), "utf8"), corruptState);
});
