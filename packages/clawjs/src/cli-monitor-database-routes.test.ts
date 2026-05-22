import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "vitest";

const MONITOR_DATABASE_CONSUMERS = [
  "packages/clawjs/src/cli-network-command.ts",
  "packages/clawjs/src/cli-system-command.ts",
] as const;

test("network and system CLIs use the central monitor data root fallback", () => {
  for (const sourcePath of MONITOR_DATABASE_CONSUMERS) {
    const source = fs.readFileSync(path.resolve(process.cwd(), sourcePath), "utf8");
    assert.match(source, /resolveClawGlobalDataStorageDir/);
    assert.equal(/path\.join\(expandHome\(process\.env\.CLAW_HOME\), "data", "monitor\.sqlite"\)/.test(source), false, sourcePath);
    assert.equal(/resolveClawPersistentSurfacePath\(["']claw[.]database[.]monitor["']\)/.test(source), false, sourcePath);
  }
});
