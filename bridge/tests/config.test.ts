import { resolveClawPersistentSurfacePath } from "@clawjs/core";
import { test } from "vitest";
import assert from "node:assert/strict";
import { join } from "node:path";

import { loadConfig } from "../src/config.ts";

function expandHome(value: string, home: string): string {
  return value.startsWith("~/") ? join(home, value.slice(2)) : value;
}

test("loadConfig defaults bridge storage to the canonical runtime sidecar", () => {
  const home = "/tmp/clawjs-bridge-home";
  const root = expandHome(resolveClawPersistentSurfacePath("claw.global.data"), home);
  const config = loadConfig({
    HOME: home,
    CLAW_DATA_DIR: root,
  });

  assert.equal(config.dbPath, join(root, "core.sqlite"));
  assert.equal(config.statusPath, expandHome(resolveClawPersistentSurfacePath("clawix.home.state", "", "bridge-status.json"), home));
});
