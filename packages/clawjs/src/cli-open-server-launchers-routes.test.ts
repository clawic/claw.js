import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "vitest";

import { CLI_EXIT_USAGE } from "./cli-errors.ts";
import { openStateDir } from "./cli-open-state.ts";
import { runCliCapture } from "./index-test-utils.ts";

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

test("open internal server rejects invalid ports before writing state", async () => {
  const staleTokenPath = path.join(openStateDir(), "storage-token-127.0.0.1-NaN.txt");
  fs.rmSync(staleTokenPath, { force: true });

  const result = await runCliCapture(["__open-server", "storage", "--port", "nope", "--json"], process.cwd());
  assert.equal(result.code, CLI_EXIT_USAGE);
  const payload = JSON.parse(result.stdout) as { ok: boolean; error: { code: string; status: string }; meta: { canonicalCommand: string } };
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "invalid_port");
  assert.equal(payload.error.status, "USAGE");
  assert.equal(payload.meta.canonicalCommand, "__open-server");
  assert.equal(fs.existsSync(staleTokenPath), false);
});

test("open internal server rejects unsafe hosts before writing state", async () => {
  const escapedTokenPath = path.join(openStateDir(), "storage-token-../bad-4242.txt");
  fs.rmSync(path.dirname(escapedTokenPath), { recursive: true, force: true });

  const result = await runCliCapture(["__open-server", "storage", "--host", "../bad", "--port", "4242", "--json"], process.cwd());
  assert.equal(result.code, CLI_EXIT_USAGE);
  const payload = JSON.parse(result.stdout) as { ok: boolean; error: { code: string; status: string }; meta: { canonicalCommand: string } };
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "invalid_host");
  assert.equal(payload.error.status, "USAGE");
  assert.equal(payload.meta.canonicalCommand, "__open-server");
  assert.equal(fs.existsSync(escapedTokenPath), false);
});
