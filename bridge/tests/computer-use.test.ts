import { test } from "vitest";
import assert from "node:assert/strict";

import { RecorderExecutor } from "../src/command-executor.ts";
import {
  ComputerUse,
  ComputerUseUnsupportedError,
} from "../src/computer-use.ts";

function fakeExecutor(opts: {
  hasScreencapture?: boolean;
  hasOsascript?: boolean;
  hasCliclick?: boolean;
  pngBytes?: number[];
} = {}): RecorderExecutor {
  const recorder = new RecorderExecutor((input) => {
    if (input.command === "screencapture") {
      return { exitCode: 0, stdout: Buffer.from(opts.pngBytes ?? [0x89, 0x50, 0x4e, 0x47]) };
    }
    if (input.command === "osascript") return { exitCode: 0 };
    if (input.command === "cliclick") return { exitCode: 0 };
    return { exitCode: 1, stderr: Buffer.from("unknown") };
  });
  if (opts.hasScreencapture !== false) recorder.knownBinaries.add("screencapture");
  if (opts.hasOsascript !== false) recorder.knownBinaries.add("osascript");
  if (opts.hasCliclick !== false) recorder.knownBinaries.add("cliclick");
  return recorder;
}

async function makeMacComputerUse(executor: RecorderExecutor): Promise<ComputerUse> {
  const cu = new ComputerUse({ executor, platform: "darwin" });
  await cu.refreshCapabilities();
  return cu;
}

test("capabilities reflect detected binaries on darwin", async () => {
  const executor = fakeExecutor({ hasCliclick: false });
  const cu = await makeMacComputerUse(executor);
  const caps = cu.capabilities();
  assert.equal(caps.platform, "darwin");
  assert.equal(caps.screenshot, true);
  assert.equal(caps.keystroke, true);
  assert.equal(caps.click, false);
});

test("capabilities are all false on non-mac platforms", async () => {
  const executor = fakeExecutor();
  const cu = new ComputerUse({ executor, platform: "linux" });
  await cu.refreshCapabilities();
  assert.deepEqual(cu.capabilities(), {
    platform: "linux",
    screenshot: false,
    keystroke: false,
    click: false,
  });
});

test("screenshot calls screencapture with -x -t png and returns stdout", async () => {
  const executor = fakeExecutor();
  const cu = await makeMacComputerUse(executor);
  const result = await cu.screenshot();
  assert.equal(result.format, "png");
  assert.deepEqual([...result.bytes], [0x89, 0x50, 0x4e, 0x47]);
  const inv = executor.invocations.find((i) => i.command === "screencapture");
  assert.ok(inv);
  assert.deepEqual(inv!.args, ["-x", "-t", "png", "-"]);
});

test("screenshot honours display and region options", async () => {
  const executor = fakeExecutor();
  const cu = await makeMacComputerUse(executor);
  await cu.screenshot({
    display: 2,
    region: { x: 10, y: 20, width: 300, height: 200 },
    format: "jpg",
  });
  const inv = executor.invocations.find((i) => i.command === "screencapture");
  assert.deepEqual(inv!.args, [
    "-x",
    "-t",
    "jpg",
    "-D",
    "2",
    "-R",
    "10,20,300,200",
    "-",
  ]);
});

test("screenshot rejects when capability is missing", async () => {
  const executor = fakeExecutor({ hasScreencapture: false });
  const cu = await makeMacComputerUse(executor);
  await assert.rejects(cu.screenshot(), ComputerUseUnsupportedError);
});

test("keystroke calls osascript with System Events keystroke and escapes quotes", async () => {
  const executor = fakeExecutor();
  const cu = await makeMacComputerUse(executor);
  await cu.keystroke('hello "world"');
  const inv = executor.invocations.find((i) => i.command === "osascript");
  assert.ok(inv);
  assert.equal(inv!.args[0], "-e");
  assert.match(
    inv!.args[1]!,
    /tell application "System Events" to keystroke "hello \\"world\\""/,
  );
});

test("key sends a key code with modifiers", async () => {
  const executor = fakeExecutor();
  const cu = await makeMacComputerUse(executor);
  await cu.key(36, ["command", "shift"]);
  const inv = executor.invocations.find((i) => i.command === "osascript");
  assert.match(
    inv!.args[1]!,
    /key code 36 using \{command down, shift down\}/,
  );
});

test("key rejects non-integer codes", async () => {
  const executor = fakeExecutor();
  const cu = await makeMacComputerUse(executor);
  await assert.rejects(cu.key(3.14, []));
  await assert.rejects(cu.key(-1, []));
  await assert.rejects(cu.key(999, []));
});

test("click uses cliclick when available", async () => {
  const executor = fakeExecutor();
  const cu = await makeMacComputerUse(executor);
  await cu.click(120.7, 240.4, "right");
  const inv = executor.invocations.find((i) => i.command === "cliclick");
  assert.ok(inv);
  assert.deepEqual(inv!.args, ["rc:121,240"]);
});

test("click rejects when cliclick is missing", async () => {
  const executor = fakeExecutor({ hasCliclick: false });
  const cu = await makeMacComputerUse(executor);
  await assert.rejects(cu.click(10, 20), ComputerUseUnsupportedError);
});

test("click rejects on non-mac platform", async () => {
  const executor = fakeExecutor();
  const cu = new ComputerUse({ executor, platform: "linux" });
  await cu.refreshCapabilities();
  await assert.rejects(cu.click(10, 20), ComputerUseUnsupportedError);
});
