import { spawn } from "child_process";

import type { ChannelMessageRecord, ChannelProcessorDescriptor } from "@clawjs/core";

export type ChannelProcessorAction =
  | {
      type: "send_message";
      targetId?: string;
      text?: string;
      media?: string;
      mediaType?: "photo" | "video" | "document" | "audio" | "animation";
      threadId?: string | number;
      parseMode?: "HTML" | "Markdown" | "MarkdownV2";
      agentId?: string;
      metadata?: Record<string, unknown>;
    }
  | {
      type: "register_target";
      provider?: string;
      accountId?: string;
      targetId: string;
      kind?: "dm" | "group" | "supergroup" | "channel" | "topic" | "unknown";
      label?: string;
      title?: string;
      username?: string;
      parentTargetId?: string;
      threadId?: string | number;
      metadata?: Record<string, unknown>;
    }
  | {
      type: "grant_permission";
      agentId: string;
      provider?: string;
      accountId?: string;
      targetId?: string;
      permissions: Array<"read" | "write" | "ingest" | "admin">;
      priority?: number;
      metadata?: Record<string, unknown>;
    }
  | { type: "ignore"; reason?: string };

export interface ChannelProcessorEvent {
  type: "channel.message.received";
  provider: string;
  accountId: string;
  targetId: string;
  message: ChannelMessageRecord;
  processorId?: string;
}

export interface ChannelProcessorResult {
  actions: ChannelProcessorAction[];
  rawOutput: string;
  exitCode: number;
}

function splitCommand(command: string): string[] {
  const parts: string[] = [];
  const pattern = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(command))) {
    parts.push((match[1] ?? match[2] ?? match[3] ?? "").replace(/\\"/g, "\"").replace(/\\'/g, "'"));
  }
  return parts;
}

function normalizeActions(payload: unknown): ChannelProcessorAction[] {
  const candidate = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { actions?: unknown[] } | null)?.actions)
      ? (payload as { actions: unknown[] }).actions
      : payload && typeof payload === "object"
        ? [payload]
        : [];
  return candidate.filter((entry): entry is ChannelProcessorAction => {
    if (!entry || typeof entry !== "object") return false;
    const type = (entry as { type?: unknown }).type;
    return type === "send_message" || type === "register_target" || type === "grant_permission" || type === "ignore";
  });
}

export async function invokeChannelProcessor(
  processor: ChannelProcessorDescriptor,
  event: ChannelProcessorEvent,
  options: { env?: NodeJS.ProcessEnv; timeoutMs?: number } = {},
): Promise<ChannelProcessorResult> {
  if (!processor.enabled) {
    return { actions: [{ type: "ignore", reason: "processor disabled" }], rawOutput: "", exitCode: 0 };
  }
  const parts = splitCommand(processor.command);
  const command = parts[0];
  if (!command) {
    throw new Error(`channel processor ${processor.id} has no command`);
  }
  const args = parts.slice(1);
  const input = JSON.stringify({
    ...event,
    processorId: processor.id,
    processor: {
      id: processor.id,
      agentId: processor.agentId,
    },
  });

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: processor.cwd,
      env: {
        ...process.env,
        ...(options.env ?? {}),
        CLAWJS_CHANNEL_PROCESSOR_ID: processor.id,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
    }, options.timeoutMs ?? 30_000);

    child.stdout?.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      const exitCode = code ?? 0;
      if (exitCode !== 0) {
        reject(new Error(stderr.trim() || `channel processor ${processor.id} exited with ${exitCode}`));
        return;
      }
      const trimmed = stdout.trim();
      if (!trimmed) {
        resolve({ actions: [], rawOutput: stdout, exitCode });
        return;
      }
      try {
        resolve({ actions: normalizeActions(JSON.parse(trimmed)), rawOutput: stdout, exitCode });
      } catch (error) {
        reject(new Error(`channel processor ${processor.id} returned invalid JSON: ${error instanceof Error ? error.message : "parse error"}`));
      }
    });
    child.stdin?.end(input);
  });
}
