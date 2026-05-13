import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";

import { loadConfig } from "../src/config.ts";

test("loadConfig defaults bridge storage to the canonical runtime sidecar", () => {
  const home = "/tmp/clawjs-bridge-home";
  const root = join(home, "Library", "Application Support", "Clawix", "clawjs");
  const config = loadConfig({
    HOME: home,
    CLAW_DATA_DIR: root,
  });

  assert.equal(config.dbPath, join(root, "runtime.sqlite"));
  assert.equal(config.statusPath, join(home, ".clawix", "state", "bridge-status.json"));
});
