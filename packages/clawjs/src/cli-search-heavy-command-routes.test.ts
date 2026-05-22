import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";

import { searchFallbackDbPath } from "./cli-search-heavy-command.ts";

test("search fallback database path resolves through the Mac Care route atlas", () => {
  assert.equal(searchFallbackDbPath(), "/tmp/claw-search.sqlite");
});

test("search fallback database path does not own a direct os tmpdir fallback", () => {
  const source = fs.readFileSync(new URL("./cli-search-heavy-command.ts", import.meta.url), "utf8");
  assert.match(source, /requireMacCareRoutePathPattern\("mac_care\.route\.system_temp"\)/);
  assert.equal(source.includes('path.join(os.tmpdir(), "claw-search.sqlite")'), false);
});
