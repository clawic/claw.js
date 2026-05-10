import { z } from "zod";

import {
  SshClientError,
  installBridgeOverSsh,
  type SshClient,
} from "@clawjs/ssh-client";

export const SshJobInputSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal("ssh.open"),
    hostId: z.string().min(1),
  }),
  z.object({
    method: z.literal("ssh.exec"),
    hostId: z.string().min(1),
    command: z.string().min(1),
    env: z.record(z.string()).optional(),
    cwd: z.string().min(1).optional(),
    input: z.string().optional(),
    pty: z.boolean().optional(),
    timeoutMs: z.number().int().min(1).optional(),
  }),
  z.object({
    method: z.literal("ssh.sftp.writeFile"),
    hostId: z.string().min(1),
    remotePath: z.string().min(1),
    dataBase64: z.string(),
    mode: z.number().int().min(0).optional(),
  }),
  z.object({
    method: z.literal("ssh.sftp.readFile"),
    hostId: z.string().min(1),
    remotePath: z.string().min(1),
  }),
  z.object({
    method: z.literal("ssh.sftp.readdir"),
    hostId: z.string().min(1),
    remotePath: z.string().min(1),
  }),
  z.object({
    method: z.literal("ssh.sftp.unlink"),
    hostId: z.string().min(1),
    remotePath: z.string().min(1),
  }),
  z.object({
    method: z.literal("ssh.sftp.mkdir"),
    hostId: z.string().min(1),
    remotePath: z.string().min(1),
    mode: z.number().int().min(0).optional(),
  }),
  z.object({
    method: z.literal("ssh.close"),
    hostId: z.string().min(1),
  }),
  z.object({
    method: z.literal("ssh.list-sessions"),
  }),
  z.object({
    method: z.literal("ssh.installBridge"),
    hostId: z.string().min(1),
    localBinaryPath: z.string().min(1),
    remotePath: z.string().optional(),
    port: z.number().int().min(1).max(65535).optional(),
    httpPort: z.number().int().min(1).max(65535).optional(),
    systemdUnitName: z.string().optional(),
    installSystemd: z.boolean().optional(),
    unitBody: z.string().optional(),
  }),
]);

export type SshJobInput = z.infer<typeof SshJobInputSchema>;

export interface SshAuditSink {
  record(input: {
    action: "proxySsh" | "proxyExec";
    outcome: "success" | "failure" | "deny" | "allow";
    actorId?: string;
    targetId?: string;
    context?: Record<string, unknown>;
  }): void;
}

export interface SshJobContext {
  client: SshClient;
  audit?: SshAuditSink;
  actorId?: string;
  onStdout?: (chunk: Buffer) => void;
  onStderr?: (chunk: Buffer) => void;
}

export type SshJobOutcome =
  | { ok: true; method: string; jobId: string; result: unknown }
  | { ok: false; method: string; jobId: string; error: string };

export async function handleSshJob(
  ctx: SshJobContext,
  rawInput: unknown,
  jobId: string,
): Promise<SshJobOutcome> {
  const parsed = SshJobInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      method: "unknown",
      jobId,
      error: `invalid ssh job: ${parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
    };
  }
  const input = parsed.data;
  try {
    const result = await dispatch(ctx, input);
    ctx.audit?.record({
      action: "proxySsh",
      outcome: "success",
      actorId: ctx.actorId,
      targetId: "hostId" in input ? input.hostId : undefined,
      context: { jobId, method: input.method, ...summary(input) },
    });
    return { ok: true, method: input.method, jobId, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.audit?.record({
      action: "proxySsh",
      outcome: "failure",
      actorId: ctx.actorId,
      targetId: "hostId" in input ? input.hostId : undefined,
      context: { jobId, method: input.method, error: message, ...summary(input) },
    });
    return { ok: false, method: input.method, jobId, error: message };
  }
}

async function dispatch(
  ctx: SshJobContext,
  input: SshJobInput,
): Promise<unknown> {
  switch (input.method) {
    case "ssh.open": {
      const session = await ctx.client.open(input.hostId);
      return session.info();
    }
    case "ssh.exec": {
      const session = await ctx.client.open(input.hostId);
      const result = await session.exec({
        command: input.command,
        env: input.env,
        cwd: input.cwd,
        input: input.input,
        pty: input.pty,
        timeoutMs: input.timeoutMs,
        onStdout: ctx.onStdout,
        onStderr: ctx.onStderr,
      });
      return {
        exitCode: result.exitCode,
        signal: result.signal,
        stdoutBase64: result.stdout.toString("base64"),
        stderrBase64: result.stderr.toString("base64"),
        durationMs: result.durationMs,
      };
    }
    case "ssh.sftp.writeFile": {
      const session = await ctx.client.open(input.hostId);
      const sftp = await session.sftp();
      try {
        const bytes = Buffer.from(input.dataBase64, "base64");
        await sftp.writeFile(input.remotePath, bytes);
        if (input.mode !== undefined) {
          await sftp.chmod(input.remotePath, input.mode);
        }
        return { bytes: bytes.byteLength };
      } finally {
        await sftp.close();
      }
    }
    case "ssh.sftp.readFile": {
      const session = await ctx.client.open(input.hostId);
      const sftp = await session.sftp();
      try {
        const data = await sftp.readFile(input.remotePath);
        return { dataBase64: data.toString("base64"), bytes: data.byteLength };
      } finally {
        await sftp.close();
      }
    }
    case "ssh.sftp.readdir": {
      const session = await ctx.client.open(input.hostId);
      const sftp = await session.sftp();
      try {
        const entries = await sftp.readdir(input.remotePath);
        return { entries };
      } finally {
        await sftp.close();
      }
    }
    case "ssh.sftp.unlink": {
      const session = await ctx.client.open(input.hostId);
      const sftp = await session.sftp();
      try {
        await sftp.unlink(input.remotePath);
        return { removed: true };
      } finally {
        await sftp.close();
      }
    }
    case "ssh.sftp.mkdir": {
      const session = await ctx.client.open(input.hostId);
      const sftp = await session.sftp();
      try {
        await sftp.mkdir(input.remotePath, input.mode);
        return { created: true };
      } finally {
        await sftp.close();
      }
    }
    case "ssh.close":
      await ctx.client.close(input.hostId);
      return { closed: true };
    case "ssh.list-sessions":
      return { sessions: ctx.client.listSessions() };
    case "ssh.installBridge":
      return installBridgeOverSsh(ctx.client, {
        hostId: input.hostId,
        localBinaryPath: input.localBinaryPath,
        remotePath: input.remotePath,
        port: input.port,
        httpPort: input.httpPort,
        systemdUnitName: input.systemdUnitName,
        installSystemd: input.installSystemd,
        unitBody: input.unitBody,
      });
  }
}

function summary(input: SshJobInput): Record<string, unknown> {
  if (input.method === "ssh.exec") {
    return { command: redactCommand(input.command), pty: input.pty };
  }
  if (
    input.method === "ssh.sftp.writeFile" ||
    input.method === "ssh.sftp.readFile" ||
    input.method === "ssh.sftp.readdir" ||
    input.method === "ssh.sftp.unlink" ||
    input.method === "ssh.sftp.mkdir"
  ) {
    return { remotePath: input.remotePath };
  }
  if (input.method === "ssh.installBridge") {
    return { remotePath: input.remotePath, port: input.port };
  }
  return {};
}

function redactCommand(cmd: string): string {
  return cmd.length > 200 ? `${cmd.slice(0, 200)}...` : cmd;
}

export { SshClientError };
