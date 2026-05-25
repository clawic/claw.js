import assert from "node:assert/strict";
import { spawn } from "node:child_process";

import { test } from "vitest";

test("local backend handles stdin EPIPE when a command exits before consuming input", async () => {
  const result = await runNode([
    "--import",
    "tsx",
    "--input-type=module",
    "-e",
    `
      import { localBackend } from "./packages/clawjs-sandbox/src/backends/local.ts";

      process.on("uncaughtException", (error) => {
        console.error("uncaught", error);
        process.exit(99);
      });

      const result = await localBackend.run({
        backend: "local",
        command: process.execPath,
        args: ["-e", "process.exit(0)"],
        stdin: "x".repeat(50 * 1024 * 1024),
        timeoutMs: 1000,
      });
      console.log(JSON.stringify({
        status: result.status,
        exitCode: result.exitCode,
        error: result.error ?? null,
      }));
    `,
  ]);

  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout.trim()), {
    status: "completed",
    exitCode: 0,
    error: null,
  });
});

function runNode(args: string[]): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: new URL("../../../..", import.meta.url),
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => { stdout.push(chunk); });
    child.stderr.on("data", (chunk: Buffer) => { stderr.push(chunk); });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({
        code,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      });
    });
  });
}
