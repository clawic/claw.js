import type { Message } from "@clawjs/core";

import { buildOpenAIResponseMessages } from "./prompt.ts";
import { summarizeTitle } from "./transcript.ts";
import type { CommandRunner, SessionGatewayDescriptor, RuntimeSessionAdapter } from "../runtime/contracts.ts";
import { extractCodexJsonlText, extractJsonPayloadText, extractResponseOutputText } from "./stream.ts";
import { buildOpenClawCommand } from "../runtime/openclaw-command.ts";

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function buildTitleSessionSnippet(messages: Array<Pick<Message, "role" | "content">>, maxMessages = 6): string {
  return messages
    .slice(0, maxMessages)
    .map((message) => `${message.role.toUpperCase()}: ${normalizeText(message.content)}`)
    .join("\n");
}

export function buildTitlePrompt(messages: Array<Pick<Message, "role" | "content">>): string {
  const snippet = buildTitleSessionSnippet(messages);
  return [
    "Generate a concise session title.",
    "Return only the title, with no quotes, markdown, or explanation.",
    "Use 2 to 6 words when possible.",
    `SESSION:\n${snippet}`,
  ].join("\n\n");
}

async function generateTitleViaGateway(
  messages: Array<Pick<Message, "role" | "content">>,
  gatewayConfig: SessionGatewayDescriptor,
  fetchImpl: typeof fetch,
  agentId?: string,
): Promise<string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (gatewayConfig.token) {
    headers.Authorization = `Bearer ${gatewayConfig.token}`;
  }
  if (agentId) {
    headers["x-openclaw-agent-id"] = agentId;
    headers["x-openclaw-session-key"] = "title-preview";
  }

  const response = gatewayConfig.kind === "openai-responses"
    ? await fetchImpl(`${gatewayConfig.url}/v1/responses`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: "openclaw",
        user: "title-preview",
        input: buildOpenAIResponseMessages({
          messages: [{
            role: "user",
            content: buildTitlePrompt(messages),
          }],
        }),
      }),
    })
    : gatewayConfig.kind === "openai-chat-completions"
      ? await fetchImpl(`${gatewayConfig.url}/v1/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: "default",
          messages: [
            {
              role: "user",
              content: buildTitlePrompt(messages),
            },
          ],
        }),
      })
      : null;

  if (!response) {
    throw new Error(`Unsupported gateway transport: ${gatewayConfig.kind}`);
  }

  if (!response.ok) {
    throw new Error(`Gateway HTTP ${response.status}: ${await response.text()}`);
  }

  const payload = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
    output_text?: string;
    output?: Array<{ content?: Array<{ text?: string; delta?: string }> }>;
  };
  return summarizeTitle(
    gatewayConfig.kind === "openai-responses"
      ? extractResponseOutputText(payload)
      : payload.choices?.[0]?.message?.content || "",
  );
}

async function generateTitleViaCli(
  messages: Array<Pick<Message, "role" | "content">>,
  sessionAdapter: RuntimeSessionAdapter,
  runner: CommandRunner,
  agentId?: string,
): Promise<string> {
  const invocation = sessionAdapter.buildCliInvocation({
    sessionId: "title-preview",
    agentId,
    prompt: buildTitlePrompt(messages),
  });
  const result = await runner.exec(invocation.command, invocation.args, {
    env: invocation.env,
    timeoutMs: invocation.timeoutMs ?? 65_000,
  });

  const combinedOutput = [result.stdout, result.stderr].filter((value) => value && value.trim()).join("\n");
  const text = invocation.parser === "json-payloads"
    ? extractJsonPayloadText(combinedOutput)
    : invocation.parser === "codex-jsonl"
      ? extractCodexJsonlText(combinedOutput)
      : result.stdout.trim();
  return summarizeTitle(text);
}

export async function generateRuntimeSessionTitle(input: {
  messages: Array<Pick<Message, "role" | "content">>;
  agentId?: string;
  sessionAdapter?: RuntimeSessionAdapter;
  gatewayConfig?: {
    url: string;
    token?: string;
    port?: number;
    source?: string;
    configPath?: string;
  } | null;
  fetchImpl?: typeof fetch;
  runner?: CommandRunner;
}): Promise<string> {
  const meaningfulMessages = input.messages.filter((message) => normalizeText(message.content).length > 0);
  if (meaningfulMessages.length === 0) {
    return summarizeTitle("");
  }

  const gateway = input.sessionAdapter?.gateway ?? (input.gatewayConfig?.url
    ? {
        kind: "openai-responses" as const,
        url: input.gatewayConfig.url,
        ...(input.gatewayConfig.token ? { token: input.gatewayConfig.token } : {}),
      }
    : null);
  const fallbackGateway = input.sessionAdapter?.fallbackGateway ?? (input.gatewayConfig?.url
    ? {
        kind: "openai-chat-completions" as const,
        url: input.gatewayConfig.url,
        ...(input.gatewayConfig.token ? { token: input.gatewayConfig.token } : {}),
      }
    : null);
  const sessionAdapter = input.sessionAdapter ?? (input.agentId || gateway
    ? {
        transport: {
          kind: gateway ? "hybrid" : "cli",
          streaming: false,
          ...(gateway ? { gatewayKind: "openai-responses" as const } : {}),
        },
        gateway,
        fallbackGateway,
        buildCliInvocation(cliInput) {
          if (!cliInput.agentId) {
            throw new Error("agentId is required for OpenClaw CLI title generation");
          }
          return {
            ...buildOpenClawCommand([
              "agent",
              "--agent",
              cliInput.agentId,
              "--message",
              cliInput.prompt,
              "--thinking",
              "minimal",
              "--json",
              "--timeout",
              "60",
            ]),
            timeoutMs: 65_000,
            parser: "json-payloads" as const,
          };
        },
      }
    : undefined);

  if (sessionAdapter?.gateway && input.fetchImpl) {
    try {
      return await generateTitleViaGateway(
        meaningfulMessages,
        sessionAdapter.fallbackGateway ?? sessionAdapter.gateway,
        input.fetchImpl,
        input.agentId,
      );
    } catch {
      if (sessionAdapter.fallbackGateway && sessionAdapter.gateway) {
        try {
          return await generateTitleViaGateway(meaningfulMessages, sessionAdapter.gateway, input.fetchImpl, input.agentId);
        } catch {
          // fall through to CLI
        }
      }
    }
  }

  if (sessionAdapter && input.runner) {
    return generateTitleViaCli(meaningfulMessages, sessionAdapter, input.runner, input.agentId);
  }

  return summarizeTitle(meaningfulMessages.find((message) => message.role === "user")?.content || meaningfulMessages[0]?.content || "");
}

export function generateSessionTitle(input: Parameters<typeof generateRuntimeSessionTitle>[0]): Promise<string> {
  return generateRuntimeSessionTitle(input);
}
