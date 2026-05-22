import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "vitest";

const LAUNCHER_PATHS = [
  "packages/clawjs/bin/secrets-server-launcher.mjs",
  "packages/clawjs/bin/drive-server-launcher.mjs",
  "packages/clawjs/bin/sessions-server-launcher.mjs",
  "packages/clawjs/bin/audio-server-launcher.mjs",
  "packages/clawjs/bin/index-server-launcher.mjs",
  "packages/clawjs/bin/database-server-launcher.mjs",
] as const;

test("open service launchers use the central global data storage helper", () => {
  for (const launcherPath of LAUNCHER_PATHS) {
    const source = fs.readFileSync(path.resolve(process.cwd(), launcherPath), "utf8");
    assert.match(source, /resolveClawGlobalDataStorageDir/);
    assert.equal(/resolveClawPersistentSurfacePath\(["']claw[.]global[.]data["']\)/.test(source), false, launcherPath);
    assert.equal(/path\.join\(expandHome\(process\.env\.CLAW_HOME\), "data"\)/.test(source), false, launcherPath);
    assert.equal(/path\.join\(process\.env\.CLAW_HOME, "data"\)/.test(source), false, launcherPath);
    assert.equal(/function expandHome\(/.test(source), false, launcherPath);
  }
});
