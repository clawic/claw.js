import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import { resolveClawGlobalDataStorageDir } from "@clawjs/core";

import { expandHome, resolveClawGlobalDataRoot } from "./surface-paths.ts";

test("node global data root uses the central storage helper", () => {
  assert.equal(resolveClawGlobalDataStorageDir({ homeDir: os.homedir() }), path.join(os.homedir(), ".claw", "data"));
  assert.equal(resolveClawGlobalDataRoot({} as NodeJS.ProcessEnv), path.join(os.homedir(), ".claw", "data"));
  assert.equal(
    resolveClawGlobalDataRoot({ CLAW_HOME: "~/custom-claw" } as NodeJS.ProcessEnv),
    path.join(os.homedir(), "custom-claw", "data"),
  );
  assert.equal(
    resolveClawGlobalDataRoot({ CLAW_DATA_DIR: "~/custom-data" } as NodeJS.ProcessEnv),
    path.join(os.homedir(), "custom-data"),
  );
  assert.equal(expandHome("~"), os.homedir());

  const source = fs.readFileSync(new URL("./surface-paths.ts", import.meta.url), "utf8");
  assert.match(source, /resolveClawGlobalDataStorageDir\(/);
  assert.equal(source.includes('path.join(expandHome(env.CLAW_HOME), "data")'), false);
});
