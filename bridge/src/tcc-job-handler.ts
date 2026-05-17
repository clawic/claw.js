import { z } from "zod";

import {
  ComputerUse,
  type ModifierKey,
} from "./computer-use.ts";
import type { TerminalProcess, TerminalProcessController } from "./terminal.ts";

const ModifierSchema = z.enum([
  "command",
  "control",
  "shift",
  "option",
]) satisfies z.ZodType<ModifierKey>;

const TccJobInputSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal("tcc.platform.capabilities"),
  }),
  z.object({
    method: z.literal("tcc.computer.screenshot"),
    display: z.number().int().min(1).max(16).optional(),
    region: z
      .object({
        x: z.number().int(),
        y: z.number().int(),
        width: z.number().int().min(1),
        height: z.number().int().min(1),
      })
      .optional(),
    format: z.enum(["png", "jpg"]).optional(),
  }),
  z.object({
    method: z.literal("tcc.computer.keystroke"),
    text: z.string().min(1),
  }),
  z.object({
    method: z.literal("tcc.computer.key"),
    keyCode: z.number().int().min(0).max(255),
    modifiers: z.array(ModifierSchema).optional(),
  }),
  z.object({
    method: z.literal("tcc.computer.click"),
    x: z.number(),
    y: z.number(),
    button: z.enum(["left", "right"]).default("left"),
  }),
  z.object({
    method: z.literal("tcc.terminal.spawn"),
    command: z.string().min(1),
    args: z.array(z.string()).optional(),
    env: z.record(z.string()).optional(),
    cwd: z.string().min(1).optional(),
    inheritSshAgent: z.boolean().default(false),
    inheritEnv: z.array(z.string()).optional(),
  }),
  z.object({
    method: z.literal("tcc.terminal.write"),
    id: z.string().min(1),
    data: z.string(),
  }),
  z.object({
    method: z.literal("tcc.terminal.endStdin"),
    id: z.string().min(1),
  }),
  z.object({
    method: z.literal("tcc.terminal.kill"),
    id: z.string().min(1),
    signal: z
      .enum([
        "SIGTERM",
        "SIGKILL",
        "SIGINT",
        "SIGHUP",
        "SIGQUIT",
      ])
      .optional(),
  }),
  z.object({
    method: z.literal("tcc.terminal.list"),
  }),
]);

type TccJobInput = z.infer<typeof TccJobInputSchema>;

export interface TccAuditSink {
  record(input: {
    action: "proxyExec" | "proxySsh" | "proxyRequest";
    outcome: "success" | "failure" | "deny" | "allow";
    actorId?: string;
    targetId?: string;
    context?: Record<string, unknown>;
  }): void;
}

export interface TccJobContext {
  computerUse?: ComputerUse;
  terminal?: TerminalProcessController;
  audit?: TccAuditSink;
  actorId?: string;
  /**
   * Called synchronously immediately after `terminal.spawn` returns, before any
   * stdout/exit events fire. Lets the caller subscribe to events for the new
   * process atomically, avoiding races for short-lived commands.
   */
  onTerminalSpawn?: (proc: TerminalProcess) => void;
}

export type TccJobOutcome =
  | { ok: true; method: string; jobId: string; result: unknown }
  | { ok: false; method: string; jobId: string; error: string };

export async function handleTccJob(
  ctx: TccJobContext,
  rawInput: unknown,
  jobId: string,
): Promise<TccJobOutcome> {
  const parsed = TccJobInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      method: "unknown",
      jobId,
      error: `invalid tcc job: ${parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
    };
  }
  const input = parsed.data;
  try {
    const result = await dispatch(ctx, input);
    auditOk(ctx, input, jobId);
    return { ok: true, method: input.method, jobId, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    auditFail(ctx, input, jobId, message);
    return { ok: false, method: input.method, jobId, error: message };
  }
}

async function dispatch(
  ctx: TccJobContext,
  input: TccJobInput,
): Promise<unknown> {
  switch (input.method) {
    case "tcc.platform.capabilities":
      return {
        computerUse: ctx.computerUse?.capabilities() ?? {
          platform: "other",
          screenshot: false,
          keystroke: false,
          click: false,
        },
        terminal: { available: !!ctx.terminal },
      };
    case "tcc.computer.screenshot": {
      requireComputerUse(ctx);
      const out = await ctx.computerUse!.screenshot({
        display: input.display,
        region: input.region,
        format: input.format,
      });
      return {
        format: out.format,
        base64: out.bytes.toString("base64"),
        durationMs: out.durationMs,
        byteLength: out.bytes.byteLength,
      };
    }
    case "tcc.computer.keystroke":
      requireComputerUse(ctx);
      await ctx.computerUse!.keystroke(input.text);
      return { ok: true };
    case "tcc.computer.key":
      requireComputerUse(ctx);
      await ctx.computerUse!.key(input.keyCode, input.modifiers ?? []);
      return { ok: true };
    case "tcc.computer.click":
      requireComputerUse(ctx);
      await ctx.computerUse!.click(input.x, input.y, input.button);
      return { ok: true };
    case "tcc.terminal.spawn": {
      requireTerminal(ctx);
      const proc = ctx.terminal!.spawn({
        command: input.command,
        args: input.args,
        env: input.env,
        cwd: input.cwd,
        inheritSshAgent: input.inheritSshAgent,
        inheritEnv: input.inheritEnv,
      });
      ctx.onTerminalSpawn?.(proc);
      return {
        id: proc.id,
        pid: proc.pid,
        command: proc.command,
        args: proc.args,
        cwd: proc.cwd,
        startedAt: proc.startedAt.toISOString(),
        inheritedSshAgent: proc.inheritedSshAgent,
      };
    }
    case "tcc.terminal.write": {
      requireTerminal(ctx);
      const ok = ctx.terminal!.write(input.id, input.data);
      return { ok };
    }
    case "tcc.terminal.endStdin": {
      requireTerminal(ctx);
      const ok = ctx.terminal!.endStdin(input.id);
      return { ok };
    }
    case "tcc.terminal.kill": {
      requireTerminal(ctx);
      const ok = ctx.terminal!.kill(input.id, input.signal ?? "SIGTERM");
      return { ok };
    }
    case "tcc.terminal.list": {
      requireTerminal(ctx);
      return {
        processes: ctx.terminal!.list().map((p) => ({
          id: p.id,
          pid: p.pid,
          command: p.command,
          args: p.args,
          cwd: p.cwd,
          startedAt: p.startedAt.toISOString(),
          inheritedSshAgent: p.inheritedSshAgent,
        })),
      };
    }
  }
}

function requireComputerUse(ctx: TccJobContext): void {
  if (!ctx.computerUse) {
    throw new Error("computer use is not configured on this daemon");
  }
}

function requireTerminal(ctx: TccJobContext): void {
  if (!ctx.terminal) {
    throw new Error("terminal manager is not configured on this daemon");
  }
}

function auditOk(ctx: TccJobContext, input: TccJobInput, jobId: string): void {
  if (!ctx.audit) return;
  const action = auditActionFor(input);
  const context = auditContextFor(input);
  ctx.audit.record({
    action,
    outcome: "success",
    actorId: ctx.actorId,
    context: { jobId, method: input.method, ...context },
  });
}

function auditFail(
  ctx: TccJobContext,
  input: TccJobInput,
  jobId: string,
  message: string,
): void {
  if (!ctx.audit) return;
  const action = auditActionFor(input);
  const context = auditContextFor(input);
  ctx.audit.record({
    action,
    outcome: "failure",
    actorId: ctx.actorId,
    context: { jobId, method: input.method, error: message, ...context },
  });
}

function auditActionFor(input: TccJobInput): "proxyExec" | "proxySsh" | "proxyRequest" {
  if (input.method === "tcc.terminal.spawn" && input.inheritSshAgent) return "proxySsh";
  if (input.method.startsWith("tcc.terminal.")) return "proxyExec";
  if (input.method.startsWith("tcc.computer.")) return "proxyExec";
  return "proxyRequest";
}

function auditContextFor(input: TccJobInput): Record<string, unknown> {
  if (input.method === "tcc.terminal.spawn") {
    return {
      command: input.command,
      args: input.args,
      cwd: input.cwd,
      inheritSshAgent: input.inheritSshAgent,
    };
  }
  if (input.method === "tcc.terminal.kill") {
    return { id: input.id, signal: input.signal };
  }
  if (input.method === "tcc.computer.click") {
    return { x: input.x, y: input.y, button: input.button };
  }
  return {};
}
