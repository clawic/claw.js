import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";

export interface TerminalSpawnInput {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  inheritSshAgent?: boolean;
  inheritEnv?: string[];
}

export interface TerminalProcess {
  id: string;
  pid: number;
  command: string;
  args: string[];
  cwd?: string;
  startedAt: Date;
  inheritedSshAgent: boolean;
}

export interface TerminalEventData {
  id: string;
  channel: "stdout" | "stderr";
  data: Buffer;
}

export interface TerminalExitData {
  id: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  durationMs: number;
}

export interface TerminalManagerOptions {
  parentEnv?: NodeJS.ProcessEnv;
  defaultInheritEnv?: string[];
  maxConcurrent?: number;
}

const DEFAULT_INHERIT_ENV = ["PATH", "HOME", "LANG", "LC_ALL", "USER", "SHELL"];

export class TerminalManager extends EventEmitter {
  private readonly processes = new Map<
    string,
    { meta: TerminalProcess; child: ChildProcessWithoutNullStreams; startedAtMs: number }
  >();
  private readonly parentEnv: NodeJS.ProcessEnv;
  private readonly defaultInheritEnv: string[];
  private readonly maxConcurrent: number;

  constructor(options: TerminalManagerOptions = {}) {
    super();
    this.parentEnv = options.parentEnv ?? process.env;
    this.defaultInheritEnv = options.defaultInheritEnv ?? DEFAULT_INHERIT_ENV;
    this.maxConcurrent = options.maxConcurrent ?? 64;
  }

  list(): TerminalProcess[] {
    return Array.from(this.processes.values()).map((entry) => entry.meta);
  }

  get(id: string): TerminalProcess | null {
    return this.processes.get(id)?.meta ?? null;
  }

  spawn(input: TerminalSpawnInput): TerminalProcess {
    if (this.processes.size >= this.maxConcurrent) {
      throw new Error(`terminal manager: max concurrent processes reached (${this.maxConcurrent})`);
    }
    const id = randomUUID();
    const env = this.buildEnv(input);
    const inheritedSshAgent =
      !!input.inheritSshAgent && typeof env.SSH_AUTH_SOCK === "string";
    const child = spawn(input.command, input.args ?? [], {
      env,
      cwd: input.cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const startedAtMs = Date.now();
    const meta: TerminalProcess = {
      id,
      pid: child.pid ?? -1,
      command: input.command,
      args: input.args ?? [],
      cwd: input.cwd,
      startedAt: new Date(startedAtMs),
      inheritedSshAgent,
    };
    this.processes.set(id, { meta, child, startedAtMs });

    child.stdout?.on("data", (chunk: Buffer) => {
      this.emit("data", { id, channel: "stdout", data: chunk } satisfies TerminalEventData);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      this.emit("data", { id, channel: "stderr", data: chunk } satisfies TerminalEventData);
    });
    child.on("error", (err) => {
      this.emit("error", { id, error: err });
    });
    child.on("exit", (code, signal) => {
      this.processes.delete(id);
      this.emit("exit", {
        id,
        exitCode: code,
        signal,
        durationMs: Date.now() - startedAtMs,
      } satisfies TerminalExitData);
    });
    return meta;
  }

  write(id: string, data: string | Buffer): boolean {
    const entry = this.processes.get(id);
    if (!entry) return false;
    return entry.child.stdin?.write(data) ?? false;
  }

  endStdin(id: string): boolean {
    const entry = this.processes.get(id);
    if (!entry) return false;
    entry.child.stdin?.end();
    return true;
  }

  kill(id: string, signal: NodeJS.Signals = "SIGTERM"): boolean {
    const entry = this.processes.get(id);
    if (!entry) return false;
    try {
      return entry.child.kill(signal);
    } catch {
      return false;
    }
  }

  async closeAll(timeoutMs: number = 2_000): Promise<void> {
    const ids = Array.from(this.processes.keys());
    for (const id of ids) this.kill(id, "SIGTERM");
    const deadline = Date.now() + timeoutMs;
    while (this.processes.size > 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    for (const id of Array.from(this.processes.keys())) {
      this.kill(id, "SIGKILL");
    }
  }

  private buildEnv(input: TerminalSpawnInput): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {};
    const inherits = new Set([...this.defaultInheritEnv, ...(input.inheritEnv ?? [])]);
    for (const key of inherits) {
      const value = this.parentEnv[key];
      if (value !== undefined) env[key] = value;
    }
    if (input.inheritSshAgent && this.parentEnv.SSH_AUTH_SOCK) {
      env.SSH_AUTH_SOCK = this.parentEnv.SSH_AUTH_SOCK;
    }
    if (input.env) {
      for (const [k, v] of Object.entries(input.env)) env[k] = v;
    }
    return env;
  }
}
