import test from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";

import {
  TerminalManager,
  type TerminalEventData,
  type TerminalExitData,
} from "../src/terminal.ts";

function collectExit(tm: TerminalManager, id: string): Promise<TerminalExitData> {
  return new Promise<TerminalExitData>((resolve) => {
    const onExit = (ev: TerminalExitData) => {
      if (ev.id !== id) return;
      tm.off("exit", onExit);
      resolve(ev);
    };
    tm.on("exit", onExit);
  });
}

function collectStdout(tm: TerminalManager, id: string): Promise<string> {
  return new Promise<string>((resolve) => {
    const chunks: Buffer[] = [];
    const onData = (ev: TerminalEventData) => {
      if (ev.id !== id || ev.channel !== "stdout") return;
      chunks.push(ev.data);
    };
    const onExit = (ev: TerminalExitData) => {
      if (ev.id !== id) return;
      tm.off("data", onData);
      tm.off("exit", onExit);
      resolve(Buffer.concat(chunks).toString("utf8"));
    };
    tm.on("data", onData);
    tm.on("exit", onExit);
  });
}

test("spawn /bin/echo emits stdout and exits 0", async () => {
  const tm = new TerminalManager({ parentEnv: {} });
  const proc = tm.spawn({ command: "/bin/echo", args: ["hola"] });
  assert.ok(proc.pid > 0);
  const text = await collectStdout(tm, proc.id);
  assert.equal(text.trim(), "hola");
});

test("spawn /bin/cat with stdin writes and end-of-stdin closes the process", async () => {
  const tm = new TerminalManager({ parentEnv: {} });
  const proc = tm.spawn({ command: "/bin/cat" });
  tm.write(proc.id, "line one\n");
  tm.write(proc.id, "line two\n");
  tm.endStdin(proc.id);
  const text = await collectStdout(tm, proc.id);
  assert.equal(text, "line one\nline two\n");
});

test("kill terminates a long-running process", async () => {
  const tm = new TerminalManager({ parentEnv: {} });
  const proc = tm.spawn({ command: "/bin/sleep", args: ["5"] });
  await delay(20);
  const exitPromise = collectExit(tm, proc.id);
  assert.equal(tm.kill(proc.id, "SIGTERM"), true);
  const exit = await exitPromise;
  assert.equal(exit.signal, "SIGTERM");
});

test("inheritSshAgent copies SSH_AUTH_SOCK from parentEnv when present", async () => {
  const tm = new TerminalManager({
    parentEnv: { PATH: "/usr/bin:/bin", SSH_AUTH_SOCK: "/tmp/agent.sock" },
  });
  const proc = tm.spawn({
    command: "/usr/bin/env",
    inheritSshAgent: true,
  });
  assert.equal(proc.inheritedSshAgent, true);
  const out = await collectStdout(tm, proc.id);
  assert.match(out, /SSH_AUTH_SOCK=\/tmp\/agent\.sock/);
});

test("inheritSshAgent off does NOT pass SSH_AUTH_SOCK", async () => {
  const tm = new TerminalManager({
    parentEnv: { PATH: "/usr/bin:/bin", SSH_AUTH_SOCK: "/tmp/agent.sock" },
  });
  const proc = tm.spawn({ command: "/usr/bin/env" });
  assert.equal(proc.inheritedSshAgent, false);
  const out = await collectStdout(tm, proc.id);
  assert.ok(!out.includes("SSH_AUTH_SOCK"));
});

test("inheritEnv default lets PATH and HOME through", async () => {
  const tm = new TerminalManager({
    parentEnv: { PATH: "/usr/bin:/bin", HOME: "/home/user", SECRET: "no" },
  });
  const proc = tm.spawn({ command: "/usr/bin/env" });
  const out = await collectStdout(tm, proc.id);
  assert.match(out, /PATH=\/usr\/bin:\/bin/);
  assert.match(out, /HOME=\/home\/user/);
  assert.ok(!out.includes("SECRET="));
});

test("explicit env entries override inherited ones", async () => {
  const tm = new TerminalManager({ parentEnv: { PATH: "/p" } });
  const proc = tm.spawn({
    command: "/usr/bin/env",
    env: { CUSTOM: "yes" },
  });
  const out = await collectStdout(tm, proc.id);
  assert.match(out, /CUSTOM=yes/);
});

test("list and get reflect alive processes only", async () => {
  const tm = new TerminalManager({ parentEnv: {} });
  const a = tm.spawn({ command: "/bin/sleep", args: ["1"] });
  const b = tm.spawn({ command: "/bin/sleep", args: ["1"] });
  const exitA = collectExit(tm, a.id);
  const exitB = collectExit(tm, b.id);
  assert.equal(tm.list().length, 2);
  assert.ok(tm.get(a.id));
  await Promise.all([exitA, exitB]);
  assert.equal(tm.list().length, 0);
});

test("closeAll terminates pending processes", async () => {
  const tm = new TerminalManager({ parentEnv: {} });
  tm.spawn({ command: "/bin/sleep", args: ["5"] });
  tm.spawn({ command: "/bin/sleep", args: ["5"] });
  await tm.closeAll(2_000);
  assert.equal(tm.list().length, 0);
});

test("maxConcurrent throws when reached", async () => {
  const tm = new TerminalManager({ parentEnv: {}, maxConcurrent: 1 });
  const proc = tm.spawn({ command: "/bin/sleep", args: ["5"] });
  const exit = collectExit(tm, proc.id);
  assert.throws(() => tm.spawn({ command: "/bin/sleep", args: ["5"] }));
  tm.kill(proc.id, "SIGTERM");
  await exit;
});
