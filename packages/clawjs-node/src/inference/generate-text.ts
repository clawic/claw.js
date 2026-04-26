import type { Message, PromptContextBlock } from "@clawjs/core";

import {
  streamRuntimeSessionEvents,
  type SessionStreamEvent,
  type StreamSessionDependencies,
} from "../sessions/stream.ts";
import type { CommandRunner, RuntimeSessionAdapter } from "../runtime/contracts.ts";

export interface GenerateTextInput {
  sessionId?: string;
  agentId?: string;
  systemPrompt?: string;
  contextBlocks?: PromptContextBlock[];
  messages: Array<Pick<Message, "role" | "content" | "attachments" | "documents" | "contextChips" | "metadata">>;
  transport?: "auto" | "gateway" | "cli";
  model?: string;
  chunkSize?: number;
  gatewayRetries?: number;
  signal?: AbortSignal;
}

export interface GenerateTextDependencies {
  fetchImpl?: typeof fetch;
  runner?: CommandRunner;
  sessionAdapter?: RuntimeSessionAdapter;
  documentResolver?: StreamSessionDependencies["documentResolver"];
}

export interface GenerateTextResult {
  text: string;
  transport: "gateway" | "cli" | null;
  fallback: boolean;
  retries: number;
  title?: string;
}

function normalizeSessionId(sessionId?: string): string {
  return sessionId?.trim() || "clawjs-inference";
}

function throwStreamEvent(event: SessionStreamEvent): never {
  if (event.type === "aborted") {
    throw new Error(event.reason ? `Inference aborted: ${event.reason}` : "Inference aborted");
  }
  if (event.type === "error") {
    throw event.error;
  }
  throw new Error("Inference streaming failed");
}

export async function generateRuntimeText(
  input: GenerateTextInput,
  dependencies: GenerateTextDependencies = {},
): Promise<GenerateTextResult> {
  let text = "";
  let transport: "gateway" | "cli" | null = null;
  let fallback = false;
  let retries = 0;
  let title: string | undefined;

  for await (const event of streamRuntimeSessionEvents({
    sessionId: normalizeSessionId(input.sessionId),
    agentId: input.agentId,
    systemPrompt: input.systemPrompt,
    contextBlocks: input.contextBlocks,
    messages: input.messages,
    transport: input.transport,
    model: input.model,
    chunkSize: input.chunkSize,
    gatewayRetries: input.gatewayRetries,
    signal: input.signal,
  }, dependencies)) {
    switch (event.type) {
      case "transport":
        transport = event.transport;
        fallback = event.fallback;
        break;
      case "retry":
        retries += 1;
        break;
      case "chunk":
        text += event.chunk.delta;
        break;
      case "title":
        title = event.title;
        break;
      case "done":
        break;
      case "aborted":
      case "error":
        throwStreamEvent(event);
    }
  }

  return {
    text: text.trim(),
    transport,
    fallback,
    retries,
    ...(title ? { title } : {}),
  };
}
