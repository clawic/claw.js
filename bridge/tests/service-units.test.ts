import { test } from "vitest";
import assert from "node:assert/strict";

import {
  buildBridgeServiceSpec,
  detectCurrentTarget,
  renderLaunchdPlist,
  renderSystemdUnit,
  SUPPORTED_TARGETS,
  tarballName,
} from "../src/service-units.ts";

test("renderSystemdUnit emits an enabled service with ExecStart and env", () => {
  const spec = buildBridgeServiceSpec({
    binaryPath: "/usr/local/bin/claw-remote",
    bridgePort: 24112,
    httpPort: 24113,
  });
  const unit = renderSystemdUnit(spec);
  assert.match(unit, /\[Unit\]/);
  assert.match(unit, /ExecStart=\/usr\/local\/bin\/claw-remote/);
  assert.match(unit, /Environment=CLAW_REMOTE_PORT=24112/);
  assert.match(unit, /Environment=CLAW_REMOTE_HTTP_PORT=24113/);
  assert.match(unit, /Restart=on-failure/);
  assert.match(unit, /WantedBy=default\.target/);
});

test("renderSystemdUnit shell-quotes args with whitespace", () => {
  const unit = renderSystemdUnit({
    unitName: "demo",
    binaryPath: "/opt/x/bin",
    args: ["--name", "two words"],
  });
  assert.match(unit, /ExecStart=\/opt\/x\/bin --name "two words"/);
});

test("renderLaunchdPlist emits a valid plist with ProgramArguments", () => {
  const spec = buildBridgeServiceSpec({
    binaryPath: "/usr/local/bin/claw-remote",
    bridgePort: 24112,
    httpPort: 24113,
  });
  const plist = renderLaunchdPlist(spec, {
    label: "com.claw.remote.user",
    runAtLoad: true,
    keepAlive: true,
    stdoutLogPath: "/tmp/clawjs.out",
    stderrLogPath: "/tmp/clawjs.err",
  });
  assert.match(plist, /<key>Label<\/key>/);
  assert.match(plist, /<string>com\.claw\.remote\.user<\/string>/);
  assert.match(plist, /<key>ProgramArguments<\/key>/);
  assert.match(plist, /<string>\/usr\/local\/bin\/claw-remote<\/string>/);
  assert.match(plist, /<key>EnvironmentVariables<\/key>/);
  assert.match(plist, /<string>24112<\/string>/);
  assert.match(plist, /<key>StandardErrorPath<\/key>/);
  assert.match(plist, /<key>RunAtLoad<\/key>\n\s*<true\/>/);
});

test("renderLaunchdPlist escapes XML special chars", () => {
  const spec = buildBridgeServiceSpec({
    binaryPath: "/tmp/Bridge & Friends",
  });
  const plist = renderLaunchdPlist(spec, {});
  assert.match(plist, /Bridge &amp; Friends/);
});

test("SUPPORTED_TARGETS covers Mac, Linux and Windows", () => {
  const expected = new Set([
    "darwin-arm64",
    "darwin-x64",
    "linux-x64",
    "linux-arm64",
    "windows-x64",
  ]);
  const got = new Set(SUPPORTED_TARGETS.map((t) => `${t.os}-${t.arch}`));
  assert.deepEqual(got, expected);
});

test("tarballName has a predictable shape", () => {
  assert.equal(
    tarballName({ os: "linux", arch: "x64" }, "0.1.0"),
    "claw-remote-linux-x64-0.1.0.tar.gz",
  );
});

test("detectCurrentTarget returns a known target for this host", () => {
  const t = detectCurrentTarget();
  assert.ok(SUPPORTED_TARGETS.find((x) => x.os === t.os && x.arch === t.arch));
});
