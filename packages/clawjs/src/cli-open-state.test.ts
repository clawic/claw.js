import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";

import { openBrowserMacPath, openStateDir, openStatePath } from "./cli-open-state.ts";

test("open state temporary paths resolve through the Mac Care route atlas", () => {
  assert.equal(openStateDir(), "/tmp/clawjs-open");
  assert.equal(openStatePath("storage", "127.0.0.1", 4242), "/tmp/clawjs-open/storage-127.0.0.1-4242.json");
});

test("open browser macOS command resolves through the Mac Care route atlas", () => {
  assert.equal(openBrowserMacPath(), "/usr/bin/open");
});

test("open state helpers require Mac Care route atlas entries", () => {
  const source = fs.readFileSync(new URL("./cli-open-state.ts", import.meta.url), "utf8");
  assert.match(source, /requireMacCareRoutePathPattern\("mac_care\.route\.system_temp"\)/);
  assert.match(source, /requireMacCareRoutePathPattern\("mac_care\.route\.system_open_cli"\)/);
  assert.equal(source.includes("os.tmpdir()"), false);
  assert.equal(source.includes('spawn("open"'), false);
});
