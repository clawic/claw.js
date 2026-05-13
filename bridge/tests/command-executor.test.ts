import { test } from "vitest";
import assert from "node:assert/strict";

import {
  ChildProcessExecutor,
  CommandTimeoutError,
  RecorderExecutor,
} from "../src/command-executor.ts";

test("ChildProcessExecutor runs a binary and captures stdout", async () => {
  const exec = new ChildProcessExecutor();
  const result = await exec.exec({ command: "/bin/echo", args: ["hello"] });
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout.toString().trim(), "hello");
});

test("ChildProcessExecutor times out a long-running command", async () => {
  const exec = new ChildProcessExecutor();
  await assert.rejects(
    exec.exec({ command: "/bin/sleep", args: ["5"], timeoutMs: 100 }),
    CommandTimeoutError,
  );
});

test("ChildProcessExecutor binaryExists detects /bin/echo via which", async () => {
  const exec = new ChildProcessExecutor();
  assert.equal(await exec.binaryExists("echo"), true);
  assert.equal(await exec.binaryExists("definitely-not-a-real-binary-xyz"), false);
});

test("RecorderExecutor records invocations and returns the configured response", async () => {
  const recorder = new RecorderExecutor((input) => {
    if (input.command === "screencapture") {
      return { exitCode: 0, stdout: Buffer.from([0x89, 0x50, 0x4e, 0x47]) };
    }
    return { exitCode: 1, stderr: Buffer.from("nope") };
  });
  const a = await recorder.exec({ command: "screencapture", args: ["-x"] });
  assert.equal(a.exitCode, 0);
  assert.deepEqual([...a.stdout], [0x89, 0x50, 0x4e, 0x47]);
  const b = await recorder.exec({ command: "other", args: [] });
  assert.equal(b.exitCode, 1);
  assert.equal(b.stderr.toString(), "nope");
  assert.equal(recorder.invocations.length, 2);
  assert.equal(recorder.invocations[0]!.command, "screencapture");
});

test("RecorderExecutor binaryExists honours knownBinaries set", async () => {
  const r = new RecorderExecutor();
  r.knownBinaries.add("screencapture");
  assert.equal(await r.binaryExists("screencapture"), true);
  assert.equal(await r.binaryExists("missing"), false);
});
