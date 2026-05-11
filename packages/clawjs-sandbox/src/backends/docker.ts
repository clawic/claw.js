import { spawn } from "node:child_process";

import type { BackendAdapter, RunRequest } from "../types.ts";

export interface DockerBackendOptions {
  dockerBin?: string;
}

export function createDockerBackend(options: DockerBackendOptions = {}): BackendAdapter {
  const dockerBin = options.dockerBin ?? "docker";
  return {
    kind: "docker",
    async run(request: RunRequest) {
      if (!request.image) {
        return {
          status: "failed",
          exitCode: null,
          stdout: "",
          stderr: "",
          error: "docker backend requires `image` in RunRequest",
        };
      }
      const dockerArgs: string[] = ["run", "--rm"];
      if (request.cwd) dockerArgs.push("-w", request.cwd);
      if (request.network) dockerArgs.push("--network", request.network);
      for (const [key, value] of Object.entries(request.env ?? {})) {
        dockerArgs.push("-e", `${key}=${value}`);
      }
      if (request.stdin) dockerArgs.push("-i");
      dockerArgs.push(request.image, request.command, ...(request.args ?? []));

      return await new Promise((resolve) => {
        const child = spawn(dockerBin, dockerArgs, { stdio: ["pipe", "pipe", "pipe"] });
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
            resolve({ status: "timeout", exitCode: code, stdout, stderr, error: `docker run timed out after ${request.timeoutMs}ms` });
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
