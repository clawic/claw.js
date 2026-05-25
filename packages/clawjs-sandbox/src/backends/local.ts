import { spawn } from "node:child_process";

import type { BackendAdapter, RunRequest } from "../types.ts";

const STREAM_LIMIT_BYTES = 4 * 1024 * 1024;
const INHERITED_ENV_KEYS = process.platform === "win32"
  ? ["PATH", "Path", "PATHEXT", "SystemRoot", "SYSTEMROOT", "WINDIR", "COMSPEC", "ComSpec"]
  : ["PATH"];

interface StreamCapture {
  chunks: Buffer[];
  capturedBytes: number;
  totalBytes: number;
  overflow: boolean;
}

function captureText(capture: StreamCapture, limit: number): { text: string; truncated: boolean } {
  const buffer = Buffer.concat(capture.chunks, capture.capturedBytes);
  if (!capture.overflow && capture.totalBytes <= limit) return { text: buffer.toString("utf8"), truncated: false };
  return {
    text: `${buffer.toString("utf8")}\n... (truncated, ${capture.totalBytes - limit} bytes more)`,
    truncated: true,
  };
}

function appendStreamChunk(capture: StreamCapture, chunk: Buffer, limit: number): boolean {
  capture.totalBytes += chunk.byteLength;
  if (capture.capturedBytes < limit) {
    const remaining = limit - capture.capturedBytes;
    const slice = chunk.byteLength > remaining ? chunk.subarray(0, remaining) : chunk;
    capture.chunks.push(slice);
    capture.capturedBytes += slice.byteLength;
  }
  if (capture.totalBytes > limit) {
    capture.overflow = true;
    return true;
  }
  return false;
}

function buildProcessEnv(requestEnv: Record<string, string> | null | undefined): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of INHERITED_ENV_KEYS) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  return { ...env, ...(requestEnv ?? {}) };
}

export const localBackend: BackendAdapter = {
  kind: "local",
  async run(request: RunRequest) {
    return await new Promise((resolve) => {
      const maxOutputBytes = Math.max(1, Math.floor(request.maxOutputBytes ?? STREAM_LIMIT_BYTES));
      const child = spawn(request.command, request.args ?? [], {
        cwd: request.cwd ?? undefined,
        env: buildProcessEnv(request.env),
        stdio: ["pipe", "pipe", "pipe"],
      });

      const stdoutCapture: StreamCapture = { chunks: [], capturedBytes: 0, totalBytes: 0, overflow: false };
      const stderrCapture: StreamCapture = { chunks: [], capturedBytes: 0, totalBytes: 0, overflow: false };
      let timedOut = false;
      let resolved = false;
      let stdinError: Error | null = null;
      let outputError: string | null = null;

      child.stdout?.on("data", (chunk: Buffer) => {
        if (appendStreamChunk(stdoutCapture, chunk, maxOutputBytes) && !outputError) {
          outputError = `stdout exceeded maxOutputBytes (${maxOutputBytes})`;
          child.kill("SIGKILL");
        }
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        if (appendStreamChunk(stderrCapture, chunk, maxOutputBytes) && !outputError) {
          outputError = `stderr exceeded maxOutputBytes (${maxOutputBytes})`;
          child.kill("SIGKILL");
        }
      });
      child.stdin?.on("error", (err: Error) => {
        stdinError = err;
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
          stdout: captureText(stdoutCapture, maxOutputBytes).text,
          stderr: captureText(stderrCapture, maxOutputBytes).text,
          error: err.message,
        });
      });

      child.on("close", (code, signal) => {
        if (resolved) return;
        resolved = true;
        if (timeout) clearTimeout(timeout);
        const stdout = captureText(stdoutCapture, maxOutputBytes).text;
        const stderr = captureText(stderrCapture, maxOutputBytes).text;
        if (outputError) {
          resolve({
            status: "failed",
            exitCode: code,
            stdout,
            stderr,
            error: outputError,
          });
          return;
        }
        if (timedOut) {
          const errorDetails = [
            `command timed out after ${request.timeoutMs}ms (signal=${signal ?? "none"})`,
            stdinError ? `stdin write failed: ${stdinError.message}` : null,
          ].filter(Boolean).join("; ");
          resolve({
            status: "timeout",
            exitCode: code,
            stdout,
            stderr,
            error: errorDetails,
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
          error: signal
            ? `exited via signal ${signal}`
            : stdinError
              ? `stdin write failed: ${stdinError.message}`
              : null,
        });
      });

      const rememberStdinError = (err: Error | null | undefined) => {
        if (err) stdinError = err;
      };

      if (request.stdin) {
        child.stdin?.write(request.stdin, rememberStdinError);
      }
      child.stdin?.end(rememberStdinError);
    });
  },
};
