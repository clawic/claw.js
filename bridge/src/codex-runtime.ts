import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import { setTimeout as delay } from "node:timers/promises";

export interface CodexRuntimeOptions {
  command: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  startupTimeoutMs?: number;
  requestTimeoutMs?: number;
  shutdownTimeoutMs?: number;
  autoRestart?: boolean;
  maxRestartAttempts?: number;
  restartBaseDelayMs?: number;
  logger?: CodexLogger;
}

export interface CodexLogger {
  info(message: string, ctx?: Record<string, unknown>): void;
  warn(message: string, ctx?: Record<string, unknown>): void;
  error(message: string, ctx?: Record<string, unknown>): void;
}

export const noopLogger: CodexLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

export interface CodexJsonRpcResponse {
  jsonrpc?: string;
  id: number | string;
  result?: unknown;
  error?: CodexJsonRpcError;
}

export interface CodexJsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface CodexEvent {
  method: string;
  params: unknown;
}

export class CodexRuntimeError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "CodexRuntimeError";
    this.code = code;
  }
}

export interface CodexRequestOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

interface PendingRequest {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timeout: NodeJS.Timeout;
  abortHandler?: () => void;
  signal?: AbortSignal;
}

type CodexState = "idle" | "starting" | "ready" | "stopping" | "stopped";

export class CodexRuntime extends EventEmitter {
  private readonly opts: Required<
    Omit<CodexRuntimeOptions, "env" | "cwd" | "logger">
  > & {
    env?: NodeJS.ProcessEnv;
    cwd?: string;
    logger: CodexLogger;
  };

  private child: ChildProcessWithoutNullStreams | null = null;
  private state: CodexState = "idle";
  private nextId = 1;
  private readonly pending = new Map<number | string, PendingRequest>();
  private buffer = "";
  private restartAttempts = 0;
  private intentionalStop = false;
  private startPromise: Promise<void> | null = null;

  constructor(options: CodexRuntimeOptions) {
    super();
    this.opts = {
      command: options.command,
      args: options.args,
      env: options.env,
      cwd: options.cwd,
      startupTimeoutMs: options.startupTimeoutMs ?? 15_000,
      requestTimeoutMs: options.requestTimeoutMs ?? 60_000,
      shutdownTimeoutMs: options.shutdownTimeoutMs ?? 5_000,
      autoRestart: options.autoRestart ?? true,
      maxRestartAttempts: options.maxRestartAttempts ?? 3,
      restartBaseDelayMs: options.restartBaseDelayMs ?? 250,
      logger: options.logger ?? noopLogger,
    };
  }

  get currentState(): CodexState {
    return this.state;
  }

  get isReady(): boolean {
    return this.state === "ready";
  }

  async start(): Promise<void> {
    if (this.state === "ready") return;
    if (this.startPromise) return this.startPromise;
    this.startPromise = this.doStart().finally(() => {
      this.startPromise = null;
    });
    return this.startPromise;
  }

  private async doStart(): Promise<void> {
    if (this.state === "starting") {
      throw new CodexRuntimeError("invalid-state", "already starting");
    }
    this.state = "starting";
    this.intentionalStop = false;
    const child = spawn(this.opts.command, this.opts.args, {
      env: this.opts.env,
      cwd: this.opts.cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child = child;
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => this.onStdout(chunk));
    child.stderr.on("data", (chunk: string) => {
      this.opts.logger.warn("codex stderr", { chunk: chunk.trimEnd() });
      this.emit("stderr", chunk);
    });
    child.on("error", (err) => {
      this.opts.logger.error("codex spawn error", { error: String(err) });
      this.emit("error", err);
    });
    child.on("exit", (code, signal) => this.onExit(code, signal));

    const initTimeout = this.opts.startupTimeoutMs;
    try {
      await this.request("initialize", {}, { timeoutMs: initTimeout });
    } catch (err) {
      this.state = "stopped";
      this.child = null;
      throw err;
    }
    this.state = "ready";
    this.restartAttempts = 0;
    this.emit("ready");
  }

  async stop(): Promise<void> {
    if (this.state === "stopped" || this.state === "idle") return;
    this.intentionalStop = true;
    this.state = "stopping";
    const child = this.child;
    if (!child) {
      this.state = "stopped";
      return;
    }
    try {
      child.stdin.end();
    } catch {
      /* ignore */
    }
    const exitPromise = new Promise<void>((resolve) => {
      const onExit = () => resolve();
      child.once("exit", onExit);
    });
    const settled = await Promise.race([
      exitPromise.then(() => "exited" as const),
      delay(this.opts.shutdownTimeoutMs).then(() => "timeout" as const),
    ]);
    if (settled === "timeout") {
      try {
        child.kill("SIGTERM");
      } catch {
        /* ignore */
      }
      await Promise.race([exitPromise, delay(1_000)]);
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
    }
    this.state = "stopped";
  }

  async restart(): Promise<void> {
    await this.stop();
    this.state = "idle";
    await this.start();
  }

  async request<TResult = unknown>(
    method: string,
    params?: unknown,
    options: CodexRequestOptions = {},
  ): Promise<TResult> {
    if (this.state === "stopped" || !this.child) {
      throw new CodexRuntimeError("not-started", `runtime not running (state: ${this.state})`);
    }
    if (this.child.killed) {
      throw new CodexRuntimeError("killed", "runtime process is killed");
    }
    const id = this.nextId++;
    const message = {
      jsonrpc: "2.0",
      id,
      method,
      ...(params !== undefined ? { params } : {}),
    };
    const timeoutMs = options.timeoutMs ?? this.opts.requestTimeoutMs;
    return new Promise<TResult>((resolve, reject) => {
      const timeout = setTimeout(() => {
        const pending = this.pending.get(id);
        if (!pending) return;
        this.pending.delete(id);
        reject(new CodexRuntimeError("timeout", `request ${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      timeout.unref?.();
      const pending: PendingRequest = {
        resolve: (value: unknown) => resolve(value as TResult),
        reject,
        timeout,
        signal: options.signal,
      };
      if (options.signal) {
        if (options.signal.aborted) {
          clearTimeout(timeout);
          reject(new CodexRuntimeError("aborted", "request aborted before send"));
          return;
        }
        pending.abortHandler = () => {
          const p = this.pending.get(id);
          if (!p) return;
          this.pending.delete(id);
          clearTimeout(p.timeout);
          reject(new CodexRuntimeError("aborted", "request aborted"));
        };
        options.signal.addEventListener("abort", pending.abortHandler, { once: true });
      }
      this.pending.set(id, pending);
      try {
        this.child!.stdin.write(`${JSON.stringify(message)}\n`);
      } catch (err) {
        this.pending.delete(id);
        clearTimeout(timeout);
        reject(
          new CodexRuntimeError(
            "write-failed",
            `failed to write request: ${String(err)}`,
          ),
        );
      }
    });
  }

  notify(method: string, params?: unknown): void {
    if (!this.child || this.child.killed) {
      throw new CodexRuntimeError("not-started", "runtime not running");
    }
    const message = {
      jsonrpc: "2.0",
      method,
      ...(params !== undefined ? { params } : {}),
    };
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private onStdout(chunk: string): void {
    this.buffer += chunk;
    let idx: number;
    while ((idx = this.buffer.indexOf("\n")) !== -1) {
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (!line) continue;
      let msg: unknown;
      try {
        msg = JSON.parse(line);
      } catch (err) {
        this.opts.logger.warn("codex non-json line", { line });
        continue;
      }
      this.dispatch(msg);
    }
  }

  private dispatch(msg: unknown): void {
    if (!msg || typeof msg !== "object") return;
    const m = msg as Record<string, unknown>;
    if ("id" in m && ("result" in m || "error" in m)) {
      this.dispatchResponse(m as unknown as CodexJsonRpcResponse);
      return;
    }
    if (typeof m.method === "string") {
      const event: CodexEvent = {
        method: m.method,
        params: m.params,
      };
      this.emit("event", event);
      this.emit(`event:${event.method}`, event.params);
    }
  }

  private dispatchResponse(msg: CodexJsonRpcResponse): void {
    const pending = this.pending.get(msg.id);
    if (!pending) return;
    this.pending.delete(msg.id);
    clearTimeout(pending.timeout);
    if (pending.abortHandler && pending.signal) {
      pending.signal.removeEventListener("abort", pending.abortHandler);
    }
    if (msg.error) {
      pending.reject(
        new CodexRuntimeError(
          `rpc-${msg.error.code}`,
          msg.error.message ?? "rpc error",
        ),
      );
      return;
    }
    pending.resolve(msg.result);
  }

  private onExit(code: number | null, signal: NodeJS.Signals | null): void {
    const previousState = this.state;
    this.opts.logger.info("codex exited", { code, signal, state: previousState });
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      if (pending.abortHandler && pending.signal) {
        pending.signal.removeEventListener("abort", pending.abortHandler);
      }
      pending.reject(
        new CodexRuntimeError(
          "exited",
          `runtime exited (code=${code} signal=${signal})`,
        ),
      );
    }
    this.pending.clear();
    this.child = null;
    this.buffer = "";
    this.state = "stopped";
    this.emit("exit", { code, signal });
    if (this.intentionalStop || !this.opts.autoRestart) return;
    if (this.restartAttempts >= this.opts.maxRestartAttempts) {
      this.emit("restart-failed", {
        attempts: this.restartAttempts,
      });
      return;
    }
    this.restartAttempts += 1;
    const wait = this.opts.restartBaseDelayMs * 2 ** (this.restartAttempts - 1);
    this.opts.logger.info("codex auto-restart", {
      attempt: this.restartAttempts,
      waitMs: wait,
    });
    setTimeout(() => {
      this.state = "idle";
      this.start().catch((err) => {
        this.opts.logger.error("codex restart failed", { error: String(err) });
      });
    }, wait).unref?.();
  }
}
