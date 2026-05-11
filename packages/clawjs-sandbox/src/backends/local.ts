import { spawn } from "node:child_process";

import type { BackendAdapter, RunRequest } from "../types.ts";

const STREAM_LIMIT_BYTES = 4 * 1024 * 1024;

function clip(buffer: Buffer, limit: number): { text: string; truncated: boolean } {
  if (buffer.byteLength <= limit) return { text: buffer.toString("utf8"), truncated: false };
  return {
    text: `${buffer.subarray(0, limit).toString("utf8")}\n... (truncated, ${buffer.byteLength - limit} bytes more)`,
    truncated: true,
  };
}

export const localBackend: BackendAdapter = {
  kind: "local",
  async run(request: RunRequest) {
    return await new Promise((resolve) => {
      const child = spawn(request.command, request.args ?? [], {
        cwd: request.cwd ?? undefined,
        env: { ...process.env, ...(request.env ?? {}) },
        stdio: ["pipe", "pipe", "pipe"],
      });

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];
      let stdoutBytes = 0;
      let stderrBytes = 0;
      let timedOut = false;
      let resolved = false;

      child.stdout?.on("data", (chunk: Buffer) => {
        stdoutBytes += chunk.byteLength;
        if (stdoutBytes <= STREAM_LIMIT_BYTES * 2) stdoutChunks.push(chunk);
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        stderrBytes += chunk.byteLength;
        if (stderrBytes <= STREAM_LIMIT_BYTES * 2) stderrChunks.push(chunk);
      });

      const timeout = request.timeoutMs && request.timeoutMs > 0
        ? setTimeout(() => {
            timedOut = true;
            child.kill("SIGKILL");
          }, request.timeoutMs)
        : null;

      child.on("error", (err) => {
        if (resolved) return;
        resolved = true;
        if (timeout) clearTimeout(timeout);
        resolve({
          status: "failed",
          exitCode: null,
          stdout: clip(Buffer.concat(stdoutChunks), STREAM_LIMIT_BYTES).text,
          stderr: clip(Buffer.concat(stderrChunks), STREAM_LIMIT_BYTES).text,
          error: err.message,
        });
      });

      child.on("close", (code, signal) => {
        if (resolved) return;
        resolved = true;
        if (timeout) clearTimeout(timeout);
        const stdout = clip(Buffer.concat(stdoutChunks), STREAM_LIMIT_BYTES).text;
        const stderr = clip(Buffer.concat(stderrChunks), STREAM_LIMIT_BYTES).text;
        if (timedOut) {
          resolve({
            status: "timeout",
            exitCode: code,
            stdout,
            stderr,
            error: `command timed out after ${request.timeoutMs}ms (signal=${signal ?? "none"})`,
          });
          return;
        }
        if (code === 0) {
          resolve({ status: "completed", exitCode: 0, stdout, stderr });
          return;
        }
        resolve({
          status: "failed",
          exitCode: code,
          stdout,
          stderr,
          error: signal ? `exited via signal ${signal}` : null,
        });
      });

      if (request.stdin) {
        child.stdin?.write(request.stdin);
      }
      child.stdin?.end();
    });
  },
};
