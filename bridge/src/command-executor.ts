import { spawn, type SpawnOptions } from "node:child_process";

export interface CommandRunInput {
  command: string;
  args?: string[];
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  stdin?: Buffer | string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface CommandRunResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: Buffer;
  stderr: Buffer;
  durationMs: number;
}

export interface CommandExecutor {
  exec(input: CommandRunInput): Promise<CommandRunResult>;
  binaryExists(name: string): Promise<boolean>;
}

export class ChildProcessExecutor implements CommandExecutor {
  async exec(input: CommandRunInput): Promise<CommandRunResult> {
    const start = Date.now();
    const opts: SpawnOptions = {
      env: input.env,
      cwd: input.cwd,
      stdio: ["pipe", "pipe", "pipe"],
    };
    const child = spawn(input.command, input.args ?? [], opts);
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    child.stdout?.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr?.on("data", (chunk: Buffer) => stderrChunks.push(chunk));
    if (input.stdin !== undefined && child.stdin) {
      child.stdin.end(input.stdin);
    } else if (child.stdin) {
      child.stdin.end();
    }
    const finished = new Promise<{
      code: number | null;
      sig: NodeJS.Signals | null;
    }>((resolve) => {
      child.once("exit", (code, sig) => resolve({ code, sig }));
    });
    let timer: NodeJS.Timeout | null = null;
    let timedOut = false;
    if (input.timeoutMs && input.timeoutMs > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        try {
          child.kill("SIGKILL");
        } catch {
          /* ignore */
        }
      }, input.timeoutMs);
      timer.unref?.();
    }
    let aborted = false;
    const onAbort = () => {
      aborted = true;
      try {
        child.kill("SIGTERM");
      } catch {
        /* ignore */
      }
    };
    if (input.signal) {
      if (input.signal.aborted) onAbort();
      else input.signal.addEventListener("abort", onAbort, { once: true });
    }
    const { code, sig } = await finished;
    if (timer) clearTimeout(timer);
    if (input.signal) input.signal.removeEventListener("abort", onAbort);
    const result: CommandRunResult = {
      exitCode: code,
      signal: sig,
      stdout: Buffer.concat(stdoutChunks),
      stderr: Buffer.concat(stderrChunks),
      durationMs: Date.now() - start,
    };
    if (timedOut) {
      throw new CommandTimeoutError(
        `command timed out after ${input.timeoutMs}ms: ${input.command}`,
        result,
      );
    }
    if (aborted) {
      throw new CommandAbortError("command aborted", result);
    }
    return result;
  }

  async binaryExists(name: string): Promise<boolean> {
    try {
      const result = await this.exec({
        command: "/usr/bin/which",
        args: [name],
        timeoutMs: 1_500,
      });
      return result.exitCode === 0 && result.stdout.byteLength > 0;
    } catch {
      return false;
    }
  }
}

export class CommandTimeoutError extends Error {
  readonly result: CommandRunResult;
  constructor(message: string, result: CommandRunResult) {
    super(message);
    this.name = "CommandTimeoutError";
    this.result = result;
  }
}

export class CommandAbortError extends Error {
  readonly result: CommandRunResult;
  constructor(message: string, result: CommandRunResult) {
    super(message);
    this.name = "CommandAbortError";
    this.result = result;
  }
}

export interface RecordedInvocation {
  command: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  stdin?: Buffer | string;
}

export type RecorderResponder = (
  input: RecordedInvocation,
) => Partial<CommandRunResult> | Promise<Partial<CommandRunResult>>;

export class RecorderExecutor implements CommandExecutor {
  readonly invocations: RecordedInvocation[] = [];
  readonly knownBinaries: Set<string> = new Set();
  private readonly responder: RecorderResponder;

  constructor(responder: RecorderResponder = () => ({ exitCode: 0 })) {
    this.responder = responder;
  }

  async exec(input: CommandRunInput): Promise<CommandRunResult> {
    const recorded: RecordedInvocation = {
      command: input.command,
      args: input.args ?? [],
      env: input.env,
      cwd: input.cwd,
      stdin: input.stdin,
    };
    this.invocations.push(recorded);
    const partial = await this.responder(recorded);
    return {
      exitCode: partial.exitCode ?? 0,
      signal: partial.signal ?? null,
      stdout: partial.stdout ?? Buffer.alloc(0),
      stderr: partial.stderr ?? Buffer.alloc(0),
      durationMs: partial.durationMs ?? 0,
    };
  }

  async binaryExists(name: string): Promise<boolean> {
    return this.knownBinaries.has(name);
  }
}
