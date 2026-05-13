import { test } from "vitest";
import assert from "node:assert/strict";

import {
  RecorderExecutor,
} from "../src/command-executor.ts";
import { ComputerUse } from "../src/computer-use.ts";
import {
  handleTccJob,
  type TccAuditSink,
} from "../src/tcc-job-handler.ts";
import { TerminalManager, type TerminalExitData } from "../src/terminal.ts";

function makeAuditSink(): {
  records: { action: string; outcome: string; context?: Record<string, unknown> }[];
  sink: TccAuditSink;
} {
  const records: { action: string; outcome: string; context?: Record<string, unknown> }[] = [];
  return {
    records,
    sink: {
      record(input) {
        records.push({
          action: input.action,
          outcome: input.outcome,
          context: input.context,
        });
      },
    },
  };
}

async function makeMacComputerUse(): Promise<{
  cu: ComputerUse;
  executor: RecorderExecutor;
}> {
  const executor = new RecorderExecutor((input) => {
    if (input.command === "screencapture") {
      return { exitCode: 0, stdout: Buffer.from([0x89, 0x50]) };
    }
    if (input.command === "osascript" || input.command === "cliclick") {
      return { exitCode: 0 };
    }
    return { exitCode: 1 };
  });
  executor.knownBinaries.add("screencapture");
  executor.knownBinaries.add("osascript");
  executor.knownBinaries.add("cliclick");
  const cu = new ComputerUse({ executor, platform: "darwin" });
  await cu.refreshCapabilities();
  return { cu, executor };
}

test("tcc.platform.capabilities returns both surfaces", async () => {
  const { cu } = await makeMacComputerUse();
  const tm = new TerminalManager({ parentEnv: {} });
  const out = await handleTccJob({ computerUse: cu, terminal: tm }, {
    method: "tcc.platform.capabilities",
  }, "j-1");
  assert.equal(out.ok, true);
  if (!out.ok) throw new Error("expected ok");
  const result = out.result as {
    computerUse: { platform: string; screenshot: boolean };
    terminal: { available: boolean };
  };
  assert.equal(result.computerUse.platform, "darwin");
  assert.equal(result.computerUse.screenshot, true);
  assert.equal(result.terminal.available, true);
});

test("tcc.computer.screenshot returns base64 and audits success", async () => {
  const { cu } = await makeMacComputerUse();
  const audit = makeAuditSink();
  const out = await handleTccJob(
    { computerUse: cu, audit: audit.sink },
    { method: "tcc.computer.screenshot" },
    "j-2",
  );
  assert.equal(out.ok, true);
  if (!out.ok) throw new Error("expected ok");
  const result = out.result as { format: string; base64: string };
  assert.equal(result.format, "png");
  assert.equal(Buffer.from(result.base64, "base64")[0], 0x89);
  assert.equal(audit.records.length, 1);
  assert.equal(audit.records[0]!.action, "proxyExec");
  assert.equal(audit.records[0]!.outcome, "success");
});

test("tcc.computer.keystroke audits proxyExec on success", async () => {
  const { cu } = await makeMacComputerUse();
  const audit = makeAuditSink();
  const out = await handleTccJob(
    { computerUse: cu, audit: audit.sink, actorId: "session-1" },
    { method: "tcc.computer.keystroke", text: "hello" },
    "j-3",
  );
  assert.equal(out.ok, true);
  assert.equal(audit.records[0]!.action, "proxyExec");
  assert.equal(audit.records[0]!.outcome, "success");
});

test("tcc.computer.click without computerUse returns ok:false", async () => {
  const out = await handleTccJob(
    {},
    { method: "tcc.computer.click", x: 10, y: 10 },
    "j-4",
  );
  assert.equal(out.ok, false);
  if (out.ok) throw new Error("expected failure");
  assert.match(out.error, /not configured/i);
});

test("tcc.terminal.spawn without inheritSshAgent audits proxyExec", async () => {
  const tm = new TerminalManager({ parentEnv: { PATH: "/bin" } });
  const audit = makeAuditSink();
  const out = await handleTccJob(
    { terminal: tm, audit: audit.sink },
    {
      method: "tcc.terminal.spawn",
      command: "/bin/echo",
      args: ["hola"],
      inheritSshAgent: false,
    },
    "j-5",
  );
  assert.equal(out.ok, true);
  if (!out.ok) throw new Error("expected ok");
  const result = out.result as { id: string; pid: number };
  assert.ok(result.id.length > 0);
  assert.ok(result.pid > 0);
  assert.equal(audit.records[0]!.action, "proxyExec");
  await new Promise<void>((resolve) =>
    tm.once("exit", (ev: TerminalExitData) => {
      if (ev.id === result.id) resolve();
    }),
  );
});

test("tcc.terminal.spawn with inheritSshAgent audits proxySsh", async () => {
  const tm = new TerminalManager({
    parentEnv: { PATH: "/bin", SSH_AUTH_SOCK: "/tmp/agent" },
  });
  const audit = makeAuditSink();
  const out = await handleTccJob(
    { terminal: tm, audit: audit.sink },
    {
      method: "tcc.terminal.spawn",
      command: "/bin/echo",
      args: ["hi"],
      inheritSshAgent: true,
    },
    "j-6",
  );
  assert.equal(out.ok, true);
  assert.equal(audit.records[0]!.action, "proxySsh");
  if (!out.ok) throw new Error("expected ok");
  const result = out.result as { id: string };
  await new Promise<void>((resolve) =>
    tm.once("exit", (ev: TerminalExitData) => {
      if (ev.id === result.id) resolve();
    }),
  );
});

test("tcc.terminal.kill terminates a tracked process", async () => {
  const tm = new TerminalManager({ parentEnv: {} });
  const spawnOut = await handleTccJob(
    { terminal: tm },
    {
      method: "tcc.terminal.spawn",
      command: "/bin/sleep",
      args: ["5"],
      inheritSshAgent: false,
    },
    "j-7-spawn",
  );
  assert.equal(spawnOut.ok, true);
  if (!spawnOut.ok) throw new Error("expected ok");
  const id = (spawnOut.result as { id: string }).id;
  const exitPromise = new Promise<TerminalExitData>((resolve) =>
    tm.once("exit", (ev: TerminalExitData) => {
      if (ev.id === id) resolve(ev);
    }),
  );
  const killOut = await handleTccJob(
    { terminal: tm },
    { method: "tcc.terminal.kill", id, signal: "SIGTERM" },
    "j-7-kill",
  );
  assert.equal(killOut.ok, true);
  const exit = await exitPromise;
  assert.equal(exit.signal, "SIGTERM");
});

test("invalid method input returns a structured error", async () => {
  const out = await handleTccJob({}, { method: "nope" }, "j-bad");
  assert.equal(out.ok, false);
  if (out.ok) throw new Error("expected failure");
  assert.match(out.error, /invalid tcc job/);
});
