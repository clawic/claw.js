import { spawn } from "node:child_process";

import type { BackendAdapter, RunRequest } from "../types.ts";

export interface SshBackendOptions {
  sshBin?: string;
}

function buildRemoteCommand(request: RunRequest): string {
  const parts: string[] = [];
  if (request.cwd) parts.push(`cd ${JSON.stringify(request.cwd)}`);
  for (const [key, value] of Object.entries(request.env ?? {})) {
    parts.push(`export ${key}=${JSON.stringify(value)}`);
  }
  const argList = (request.args ?? []).map((arg) => JSON.stringify(arg)).join(" ");
  parts.push(`${JSON.stringify(request.command)} ${argList}`.trim());
  return parts.join(" && ");
}

export function createSshBackend(options: SshBackendOptions = {}): BackendAdapter {
  const sshBin = options.sshBin ?? "ssh";
  return {
    kind: "ssh",
    async run(request: RunRequest) {
      if (!request.host) {
        return {
          status: "failed",
          exitCode: null,
          stdout: "",
          stderr: "",
          error: "ssh backend requires `host` in RunRequest",
        };
      }
      const sshArgs: string[] = [];
      if (request.identityFile) sshArgs.push("-i", request.identityFile);
      for (const opt of request.sshOptions ?? []) {
        sshArgs.push("-o", opt);
      }
      sshArgs.push(request.host, buildRemoteCommand(request));

      return await new Promise((resolve) => {
        const child = spawn(sshBin, sshArgs, { stdio: ["pipe", "pipe", "pipe"] });
        const stdoutChunks: Buffer[] = [];
        const stderrChunks: Buffer[] = [];
        child.stdout?.on("data", (chunk: Buffer) => { stdoutChunks.push(chunk); });
        child.stderr?.on("data", (chunk: Buffer) => { stderrChunks.push(chunk); });
        let timedOut = false;
        const timeout = request.timeoutMs && request.timeoutMs > 0
          ? setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, request.timeoutMs)
          : null;
        child.on("error", (err) => {
          if (timeout) clearTimeout(timeout);
          resolve({
            status: "failed",
            exitCode: null,
            stdout: Buffer.concat(stdoutChunks).toString("utf8"),
            stderr: Buffer.concat(stderrChunks).toString("utf8"),
            error: err.message,
          });
        });
        child.on("close", (code) => {
          if (timeout) clearTimeout(timeout);
          const stdout = Buffer.concat(stdoutChunks).toString("utf8");
          const stderr = Buffer.concat(stderrChunks).toString("utf8");
          if (timedOut) {
            resolve({ status: "timeout", exitCode: code, stdout, stderr, error: `ssh timed out after ${request.timeoutMs}ms` });
            return;
          }
          if (code === 0) {
            resolve({ status: "completed", exitCode: 0, stdout, stderr });
            return;
          }
          resolve({ status: "failed", exitCode: code, stdout, stderr });
        });
        if (request.stdin) child.stdin?.write(request.stdin);
        child.stdin?.end();
      });
    },
  };
}
