import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

import type { FastifyInstance } from "fastify";

import { SandboxApiClient, buildSandboxApp } from "@clawjs/sandbox";

const SECRET = "sandbox-e2e-secret";

function injectFetch(app: FastifyInstance): typeof fetch {
  return async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const response = await app.inject({
      method: init?.method ?? "GET",
      url: `${url.pathname}${url.search}`,
      headers: init?.headers as Record<string, string> | undefined,
      payload: init?.body ? String(init.body) : undefined,
    });
    return new Response(response.body, {
      status: response.statusCode,
      headers: response.headers as Record<string, string>,
    });
  };
}

interface TestContext {
  client: SandboxApiClient;
  tmpDir: string;
  close: () => Promise<void>;
}

async function spinUp(): Promise<TestContext> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sandbox-e2e-"));
  const { app } = buildSandboxApp({
    config: {
      host: "127.0.0.1",
      port: 0,
      dataDir: tmpDir,
      dbPath: path.join(tmpDir, "runtime.sqlite"),
      sharedSecret: SECRET,
    },
  });
  const client = new SandboxApiClient({
    baseUrl: "http://sandbox.test",
    token: SECRET,
    fetchImpl: injectFetch(app),
  });
  return {
    client,
    tmpDir,
    close: async () => {
      await app.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    },
  };
}

function dockerAvailable(): boolean {
  try {
    execSync("docker --version", { stdio: "ignore" });
    execSync("docker info", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

test("local: echo hello completes with exit 0 and stdout", async () => {
  const ctx = await spinUp();
  try {
    const result = await ctx.client.run({
      backend: "local",
      command: "echo",
      args: ["hello", "sandbox"],
    });
    assert.equal(result.status, "completed");
    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /hello sandbox/);
    assert.equal(result.backend, "local");
    assert.ok(result.durationMs >= 0);
  } finally {
    await ctx.close();
  }
});

test("local: cwd flag changes working directory", async () => {
  const ctx = await spinUp();
  try {
    const result = await ctx.client.run({
      backend: "local",
      command: "pwd",
      cwd: ctx.tmpDir,
    });
    const realPath = fs.realpathSync(ctx.tmpDir);
    assert.equal(result.status, "completed");
    assert.equal(result.stdout.trim(), realPath);
  } finally {
    await ctx.close();
  }
});

test("local: env vars are passed through and respected by /usr/bin/env", async () => {
  const ctx = await spinUp();
  try {
    const result = await ctx.client.run({
      backend: "local",
      command: "/usr/bin/env",
      env: { CLAWJS_TEST_FLAG: "marker-1234" },
    });
    assert.equal(result.status, "completed");
    assert.match(result.stdout, /CLAWJS_TEST_FLAG=marker-1234/);
  } finally {
    await ctx.close();
  }
});

test("local: non-zero exit code records status=failed with exitCode", async () => {
  const ctx = await spinUp();
  try {
    const result = await ctx.client.run({
      backend: "local",
      command: "sh",
      args: ["-c", "exit 7"],
    });
    assert.equal(result.status, "failed");
    assert.equal(result.exitCode, 7);
  } finally {
    await ctx.close();
  }
});

test("local: timeout kills long-running process and reports status=timeout", async () => {
  const ctx = await spinUp();
  try {
    const result = await ctx.client.run({
      backend: "local",
      command: "sh",
      args: ["-c", "sleep 5"],
      timeoutMs: 100,
    });
    assert.equal(result.status, "timeout");
    assert.match(result.error ?? "", /timed out after 100ms/);
  } finally {
    await ctx.close();
  }
});

test("local: stdin is piped into the child process", async () => {
  const ctx = await spinUp();
  try {
    const result = await ctx.client.run({
      backend: "local",
      command: "cat",
      stdin: "hello from stdin",
    });
    assert.equal(result.status, "completed");
    assert.equal(result.stdout, "hello from stdin");
  } finally {
    await ctx.close();
  }
});

test("local: list and get runs round-trips", async () => {
  const ctx = await spinUp();
  try {
    const first = await ctx.client.run({ backend: "local", command: "echo", args: ["one"] });
    const second = await ctx.client.run({ backend: "local", command: "echo", args: ["two"] });

    const list = await ctx.client.listRuns({ backend: "local" });
    const ids = list.items.map((run) => run.id);
    assert.ok(ids.includes(first.id));
    assert.ok(ids.includes(second.id));

    const retrieved = await ctx.client.getRun(first.id);
    assert.equal(retrieved.id, first.id);
    assert.equal(retrieved.command, "echo");
    assert.deepEqual(retrieved.args, ["one"]);
  } finally {
    await ctx.close();
  }
});

test("local: unknown command produces status=failed with error message", async () => {
  const ctx = await spinUp();
  try {
    const result = await ctx.client.run({
      backend: "local",
      command: "this-binary-does-not-exist-12345",
    });
    assert.equal(result.status, "failed");
    assert.ok(result.error, "should include error message");
  } finally {
    await ctx.close();
  }
});

test("health endpoint lists enabled backends", async () => {
  const ctx = await spinUp();
  try {
    const health = await ctx.client.health();
    assert.equal(health.ok, true);
    assert.ok(health.enabledBackends.includes("local"));
  } finally {
    await ctx.close();
  }
});

test("docker: smoke run echo from alpine when docker is available", { skip: !dockerAvailable() }, async () => {
  const ctx = await spinUp();
  try {
    const result = await ctx.client.run({
      backend: "docker",
      command: "echo",
      args: ["alpine-smoke"],
      image: "alpine:3.19",
      timeoutMs: 30000,
    });
    assert.equal(result.status, "completed", `expected completed, got ${result.status}: ${result.stderr}`);
    assert.match(result.stdout, /alpine-smoke/);
  } finally {
    await ctx.close();
  }
});

test("docker: missing image returns failed with error", async () => {
  const ctx = await spinUp();
  try {
    const result = await ctx.client.run({
      backend: "docker",
      command: "echo",
      args: ["x"],
    });
    assert.equal(result.status, "failed");
    assert.match(result.error ?? "", /image/);
  } finally {
    await ctx.close();
  }
});

test("ssh: missing host returns failed with error", async () => {
  const ctx = await spinUp();
  try {
    const result = await ctx.client.run({
      backend: "ssh",
      command: "uname",
    });
    assert.equal(result.status, "failed");
    assert.match(result.error ?? "", /host/);
  } finally {
    await ctx.close();
  }
});
