import { spawn } from "node:child_process";

export interface ClawCliResult {
  ok: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  json: unknown | null;
}

interface RunOptions {
  workspace: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
}

function clawBin(): string | null {
  const fromEnv = process.env.CLAW_BIN?.trim();
  if (fromEnv) return fromEnv;
  return null;
}

function clawNode(): string {
  return process.env.CLAW_NODE?.trim() || process.execPath;
}

export async function runClawCli(options: RunOptions): Promise<ClawCliResult> {
  const bin = clawBin();
  if (!bin) {
    return {
      ok: false,
      exitCode: -1,
      stdout: "",
      stderr: "CLAW_BIN env not set. Launch the surface via `claw open telegram` so the binary path is forwarded.",
      json: null,
    };
  }

  const child = spawn(clawNode(), [bin, ...options.args, "--json"], {
    cwd: options.workspace,
    env: { ...process.env, ...(options.env ?? {}) },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  let timer: NodeJS.Timeout | null = null;
  let timedOut = false;
  if (options.timeoutMs && options.timeoutMs > 0) {
    timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, options.timeoutMs);
  }

  child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf8"); });
  child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });

  const exitCode = await new Promise<number | null>((resolve) => {
    child.on("close", (code) => resolve(code));
  });
  if (timer) clearTimeout(timer);
  if (timedOut) {
    return { ok: false, exitCode, stdout, stderr: `${stderr}\n[surface] timed out`, json: null };
  }

  let json: unknown | null = null;
  const trimmed = stdout.trim();
  if (trimmed) {
    try { json = JSON.parse(trimmed); } catch { json = null; }
  }
  return { ok: exitCode === 0, exitCode, stdout, stderr, json };
}
