import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { spawn } from "child_process";

import type {
  DefaultModelRef,
  ModelDescriptor,
  ProviderAuthSummary,
  ProviderDescriptor,
  StreamChunk,
} from "@clawjs/core";
import { maskCredential } from "@clawjs/core";

import { resolveClawGlobalSurfacePath } from "../surface-paths.ts";
import type { CommandRunner, RuntimeAdapterOptions, SessionGatewayDescriptor } from "./contracts.ts";
import type { StreamSessionDependencies, StreamSessionInput } from "../sessions/stream.ts";
import {
  buildOpenAIMessages,
  buildOpenAIResponseMessages,
  type OpenAIChatMessage,
  type OpenAIResponseInputMessage,
} from "../sessions/prompt.ts";
import { brokerSecretHttp } from "../secrets/index.ts";

export type ClawRuntimeWire = "chat_completions" | "responses";
export type ClawRuntimeAuthSource = "secrets" | "env" | "missing" | "disabled";
export type ClawRuntimePermissionMode = "read-only" | "workspace-write" | "danger-full-access";

export interface ClawRuntimeModelMetadata {
  contextWindow?: number;
  supportsReasoning?: boolean;
  supportsTools?: boolean;
}

export interface ClawRuntimeProviderConfig {
  id: string;
  label: string;
  baseUrl: string;
  wire: ClawRuntimeWire;
  envKey?: string;
  secretRef?: string;
  headers?: Record<string, string>;
  models: Array<{
    id: string;
    label: string;
    default?: boolean;
    legacy?: boolean;
    metadata?: ClawRuntimeModelMetadata;
  }>;
}

export interface ResolvedClawRuntimeConfig {
  provider: ClawRuntimeProviderConfig;
  model: string;
  wire: ClawRuntimeWire;
  authSource: ClawRuntimeAuthSource;
  apiKey?: string;
  permissionMode: ClawRuntimePermissionMode;
  locations: {
    homeDir: string;
    configPath: string;
    workspacePath: string;
  };
}

interface ClawRuntimeConfigFile {
  provider?: string;
  model?: string;
  wire?: ClawRuntimeWire;
  baseUrl?: string;
  secretRef?: string;
  envKey?: string;
  headers?: Record<string, string>;
  permissionMode?: ClawRuntimePermissionMode;
  providers?: Record<string, Partial<ClawRuntimeProviderConfig>>;
}

const DEFAULT_WORKSPACE_FILES = [
  { key: "AGENTS", path: "AGENTS.md", required: true, visibleToUser: true, seedPolicy: "seed_if_missing" as const },
  { key: "TOOLS", path: "TOOLS.md", required: true, visibleToUser: true, seedPolicy: "seed_if_missing" as const },
  { key: "MEMORY", path: "MEMORY.md", required: false, visibleToUser: true, seedPolicy: "seed_if_missing" as const },
];

export const CLAW_RUNTIME_WORKSPACE_FILES = DEFAULT_WORKSPACE_FILES;

export const CLAW_RUNTIME_PROVIDERS: ClawRuntimeProviderConfig[] = [
  {
    id: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    wire: "chat_completions",
    envKey: "DEEPSEEK_API_KEY",
    models: [
      { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro", default: true, metadata: { contextWindow: 1_000_000, supportsReasoning: true, supportsTools: true } },
      { id: "deepseek-v4-flash", label: "DeepSeek V4 Flash", metadata: { contextWindow: 1_000_000, supportsReasoning: true, supportsTools: true } },
      { id: "deepseek-chat", label: "DeepSeek Chat (legacy alias)", legacy: true, metadata: { supportsTools: true } },
      { id: "deepseek-reasoner", label: "DeepSeek Reasoner (legacy alias)", legacy: true, metadata: { supportsReasoning: true, supportsTools: true } },
    ],
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    wire: "chat_completions",
    envKey: "OPENROUTER_API_KEY",
    models: [
      { id: "deepseek/deepseek-v4-pro", label: "DeepSeek V4 Pro via OpenRouter", default: true, metadata: { supportsReasoning: true, supportsTools: true } },
      { id: "openai/gpt-5.4", label: "GPT-5.4 via OpenRouter", metadata: { supportsReasoning: true, supportsTools: true } },
    ],
  },
  {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    wire: "responses",
    envKey: "OPENAI_API_KEY",
    models: [
      { id: "gpt-5.4", label: "GPT-5.4", default: true, metadata: { supportsReasoning: true, supportsTools: true } },
      { id: "gpt-5.3-codex", label: "GPT-5.3 Codex", metadata: { supportsReasoning: true, supportsTools: true } },
    ],
  },
  {
    id: "openai-compatible",
    label: "OpenAI-compatible",
    baseUrl: "https://api.openai.com/v1",
    wire: "chat_completions",
    envKey: "OPENAI_COMPATIBLE_API_KEY",
    models: [
      { id: "default", label: "Default", default: true, metadata: { supportsTools: true } },
    ],
  },
];

function readJsonFile<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function endpoint(baseUrl: string, suffix: string): string {
  return `${normalizeBaseUrl(baseUrl)}${suffix}`;
}

export function resolveClawRuntimeLocations(options: RuntimeAdapterOptions): ResolvedClawRuntimeConfig["locations"] {
  const homeDir = options.homeDir?.trim()
    || options.env?.CLAW_RUNTIME_HOME?.trim()
    || process.env.CLAW_RUNTIME_HOME?.trim()
    || resolveClawGlobalSurfacePath("claw.global.runtime_home", options.env);
  return {
    homeDir,
    configPath: options.configPath?.trim() || path.join(homeDir, "config.json"),
    workspacePath: options.workspacePath?.trim() || path.join(homeDir, "workspace"),
  };
}

function loadConfig(options: RuntimeAdapterOptions): ClawRuntimeConfigFile {
  const locations = resolveClawRuntimeLocations(options);
  const fromFile = readJsonFile<ClawRuntimeConfigFile>(locations.configPath) ?? {};
  const fromEnv = (() => {
    const raw = options.env?.CLAW_RUNTIME_CONFIG?.trim();
    if (!raw) return null;
    try {
      return JSON.parse(raw) as ClawRuntimeConfigFile;
    } catch {
      return readJsonFile<ClawRuntimeConfigFile>(raw);
    }
  })();
  return {
    ...fromFile,
    ...(fromEnv ?? {}),
  };
}

function providerById(id: string): ClawRuntimeProviderConfig {
  return CLAW_RUNTIME_PROVIDERS.find((provider) => provider.id === id) ?? CLAW_RUNTIME_PROVIDERS[0]!;
}

function mergeProvider(base: ClawRuntimeProviderConfig, override?: Partial<ClawRuntimeProviderConfig>): ClawRuntimeProviderConfig {
  if (!override) return base;
  return {
    ...base,
    ...override,
    id: override.id ?? base.id,
    label: override.label ?? base.label,
    baseUrl: override.baseUrl ?? base.baseUrl,
    wire: override.wire ?? base.wire,
    headers: {
      ...(base.headers ?? {}),
      ...(override.headers ?? {}),
    },
    models: override.models?.length ? override.models as ClawRuntimeProviderConfig["models"] : base.models,
  };
}

export function resolveClawRuntimeConfig(options: RuntimeAdapterOptions = { adapter: "claw" }): ResolvedClawRuntimeConfig {
  const fileConfig = loadConfig(options);
  const providerId = options.provider?.trim()
    || fileConfig.provider?.trim()
    || "deepseek";
  const provider = mergeProvider(providerById(providerId), fileConfig.providers?.[providerId]);
  const mergedProvider: ClawRuntimeProviderConfig = {
    ...provider,
    ...(options.baseUrl ? { baseUrl: options.baseUrl } : fileConfig.baseUrl ? { baseUrl: fileConfig.baseUrl } : {}),
    ...(options.secretRef ? { secretRef: options.secretRef } : fileConfig.secretRef ? { secretRef: fileConfig.secretRef } : {}),
    ...(options.envKey ? { envKey: options.envKey } : fileConfig.envKey ? { envKey: fileConfig.envKey } : {}),
    headers: {
      ...(provider.headers ?? {}),
      ...(fileConfig.headers ?? {}),
      ...(options.headers ?? {}),
    },
  };
  const model = options.model?.trim()
    || fileConfig.model?.trim()
    || mergedProvider.models.find((entry) => entry.default)?.id
    || mergedProvider.models[0]?.id
    || "default";
  const wire = options.wire ?? fileConfig.wire ?? mergedProvider.wire;
  const envKey = mergedProvider.envKey;
  const apiKey = envKey ? options.env?.[envKey]?.trim() || process.env[envKey]?.trim() : undefined;
  const authSource: ClawRuntimeAuthSource = mergedProvider.secretRef
    ? "secrets"
    : apiKey
      ? "env"
      : envKey
        ? "missing"
        : "disabled";

  return {
    provider: mergedProvider,
    model,
    wire,
    authSource,
    ...(apiKey ? { apiKey } : {}),
    permissionMode: options.permissionMode ?? fileConfig.permissionMode ?? "read-only",
    locations: resolveClawRuntimeLocations(options),
  };
}

export function listClawRuntimeProviders(): ProviderDescriptor[] {
  return CLAW_RUNTIME_PROVIDERS.map((provider) => ({
    id: provider.id,
    label: provider.label,
    envVars: provider.envKey ? [provider.envKey] : [],
    auth: { supportsApiKey: true, supportsEnv: !!provider.envKey },
    credentialSources: [
      ...(provider.secretRef ? [{ kind: "store" as const, key: provider.secretRef, location: "secrets" }] : []),
      ...(provider.envKey ? [{ kind: "env" as const, key: provider.envKey }] : []),
    ],
  }));
}

export function listClawRuntimeModels(options: RuntimeAdapterOptions = { adapter: "claw" }): ModelDescriptor[] {
  const resolved = resolveClawRuntimeConfig(options);
  return resolved.provider.models.map((model) => ({
    id: `${resolved.provider.id}/${model.id}`,
    modelId: model.id,
    provider: resolved.provider.id,
    label: model.label,
    available: true,
    isDefault: model.id === resolved.model,
    source: "config",
    ref: { provider: resolved.provider.id, modelId: model.id, label: model.label },
  }));
}

export function getClawRuntimeDefaultModel(options: RuntimeAdapterOptions = { adapter: "claw" }): DefaultModelRef {
  const resolved = resolveClawRuntimeConfig(options);
  const model = resolved.provider.models.find((entry) => entry.id === resolved.model);
  return {
    provider: resolved.provider.id,
    modelId: resolved.model,
    label: model?.label ?? resolved.model,
  };
}

export function getClawRuntimeProviderAuth(options: RuntimeAdapterOptions = { adapter: "claw" }): Record<string, ProviderAuthSummary> {
  const config = loadConfig(options);
  return Object.fromEntries(CLAW_RUNTIME_PROVIDERS.map((base) => {
    const provider = mergeProvider(base, config.providers?.[base.id]);
    const secretRef = options.provider === base.id ? options.secretRef ?? provider.secretRef : provider.secretRef;
    const envKey = options.provider === base.id ? options.envKey ?? provider.envKey : provider.envKey;
    const envCredential = envKey ? options.env?.[envKey]?.trim() || process.env[envKey]?.trim() : "";
    const source: ClawRuntimeAuthSource = secretRef ? "secrets" : envCredential ? "env" : envKey ? "missing" : "disabled";
    const hasAuth = source === "secrets" || source === "env";
    return [base.id, {
      provider: base.id,
      hasAuth,
      hasSubscription: hasAuth,
      hasApiKey: hasAuth,
      hasProfileApiKey: source === "secrets",
      hasEnvKey: source === "env",
      authType: hasAuth ? "api_key" : null,
      maskedCredential: source === "secrets" ? `secrets:${maskCredential(secretRef) ?? "configured"}` : maskCredential(envCredential),
      source,
    } satisfies ProviderAuthSummary];
  }));
}

function buildHeaders(config: ResolvedClawRuntimeConfig): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...(config.provider.headers ?? {}),
    ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
  };
}

const noopRunner: CommandRunner = {
  async exec() {
    return { stdout: "", stderr: "", exitCode: 0 };
  },
};

async function postJson(
  fetchImpl: typeof fetch,
  gatewayConfig: SessionGatewayDescriptor,
  body: unknown,
  pathSuffix: string,
): Promise<Response> {
  const options: RuntimeAdapterOptions = {
    adapter: "claw",
    provider: gatewayConfig.provider,
    model: gatewayConfig.model,
    wire: gatewayConfig.wire,
    baseUrl: gatewayConfig.url,
    secretRef: gatewayConfig.secretRef,
    envKey: gatewayConfig.envKey,
    headers: gatewayConfig.headers,
    permissionMode: gatewayConfig.permissionMode,
    env: gatewayConfig.env,
  };
  const config = resolveClawRuntimeConfig(options);
  const url = endpoint(config.provider.baseUrl, pathSuffix);

  if (config.provider.secretRef) {
    const result = await brokerSecretHttp(noopRunner, {
      method: "POST",
      url,
      capability: "broker.http",
      agent: gatewayConfig.env?.CLAW_AGENT_ID ?? "claw-runtime",
      riskTier: "write",
      approvalSatisfied: gatewayConfig.permissionMode === "workspace-write" || gatewayConfig.permissionMode === "danger-full-access",
      declaredFields: [{ secretName: config.provider.secretRef, fieldName: "api_key", placement: "header" }],
      headers: {
        ...config.provider.headers,
        Authorization: `Bearer {{${config.provider.secretRef}.api_key}}`,
      },
      body: JSON.stringify(body),
    }, { env: gatewayConfig.env });
    return new Response(result.bodyText, {
      status: result.status,
      headers: result.headers,
    });
  }

  return fetchImpl(url, {
    method: "POST",
    headers: buildHeaders(config),
    body: JSON.stringify(body),
  });
}

function extractChatDelta(payload: Record<string, unknown>): { text: string; reasoning: string } {
  const choice = Array.isArray(payload.choices) ? payload.choices[0] as Record<string, unknown> | undefined : undefined;
  const delta = choice?.delta as Record<string, unknown> | undefined;
  const message = choice?.message as Record<string, unknown> | undefined;
  return {
    text: typeof delta?.content === "string"
      ? delta.content
      : typeof message?.content === "string"
        ? message.content
        : "",
    reasoning: typeof delta?.reasoning_content === "string"
      ? delta.reasoning_content
      : typeof message?.reasoning_content === "string"
        ? message.reasoning_content
        : "",
  };
}

export function extractClawRuntimeChatText(payload: unknown): { text: string; reasoning: string } {
  if (!payload || typeof payload !== "object") return { text: "", reasoning: "" };
  return extractChatDelta(payload as Record<string, unknown>);
}

function extractChatToolCalls(payload: Record<string, unknown>): StreamChunk["toolCalls"] {
  const choice = Array.isArray(payload.choices) ? payload.choices[0] as Record<string, unknown> | undefined : undefined;
  const delta = choice?.delta as Record<string, unknown> | undefined;
  const calls = Array.isArray(delta?.tool_calls) ? delta.tool_calls : [];
  return calls.map((call) => {
    const record = call && typeof call === "object" ? call as Record<string, unknown> : {};
    const fn = record.function && typeof record.function === "object" ? record.function as Record<string, unknown> : {};
    return {
      ...(typeof record.id === "string" ? { id: record.id } : {}),
      ...(typeof record.index === "number" ? { index: record.index } : {}),
      ...(typeof record.type === "string" ? { type: record.type } : {}),
      ...(typeof fn.name === "string" ? { name: fn.name } : {}),
      ...(typeof fn.arguments === "string" ? { arguments: fn.arguments } : {}),
    };
  }).filter((call) => call.id || call.name || call.arguments);
}

function extractResponsesToolCalls(payload: Record<string, unknown>): StreamChunk["toolCalls"] {
  const item = payload.item && typeof payload.item === "object" ? payload.item as Record<string, unknown> : payload;
  const type = typeof item.type === "string" ? item.type : typeof payload.type === "string" ? payload.type : "";
  if (!type.includes("function_call")) return [];
  return [{
    ...(typeof item.id === "string" ? { id: item.id } : {}),
    type: "function",
    ...(typeof item.name === "string" ? { name: item.name } : {}),
    ...(typeof item.arguments === "string" ? { arguments: item.arguments } : {}),
    ...(typeof payload.delta === "string" ? { arguments: payload.delta } : {}),
  }];
}

function extractResponsesDelta(payload: Record<string, unknown>): string {
  if (typeof payload.delta === "string") return payload.delta;
  if (typeof payload.text === "string") return payload.text;
  if (typeof payload.output_text === "string") return payload.output_text;
  return "";
}

function extractUsage(payload: Record<string, unknown>): StreamChunk["usage"] | undefined {
  const usage = payload.usage && typeof payload.usage === "object" ? payload.usage as Record<string, unknown> : null;
  if (!usage) return undefined;
  const inputTokens = typeof usage.input_tokens === "number" ? usage.input_tokens : typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : undefined;
  const outputTokens = typeof usage.output_tokens === "number" ? usage.output_tokens : typeof usage.completion_tokens === "number" ? usage.completion_tokens : undefined;
  const totalTokens = typeof usage.total_tokens === "number" ? usage.total_tokens : undefined;
  return inputTokens === undefined && outputTokens === undefined && totalTokens === undefined
    ? undefined
    : { inputTokens, outputTokens, totalTokens };
}

async function* streamSseResponse(response: Response, input: StreamSessionInput, mode: ClawRuntimeWire): AsyncGenerator<StreamChunk> {
  if (!response.ok) {
    throw new Error(`Claw Runtime provider HTTP ${response.status}: ${await response.text()}`);
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Claw Runtime provider returned no body");

  const decoder = new TextDecoder();
  const messageId = randomUUID();
  let buffer = "";
  let finalUsage: StreamChunk["usage"] | undefined;

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    const blocks = mode === "responses" ? buffer.split("\n\n") : buffer.split("\n");
    buffer = done ? "" : (blocks.pop() ?? "");

    for (const block of blocks) {
      const lines = block.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (!raw || raw === "[DONE]") continue;
        let payload: Record<string, unknown>;
        try {
          payload = JSON.parse(raw) as Record<string, unknown>;
        } catch {
          continue;
        }
        const delta = mode === "chat_completions"
          ? extractChatDelta(payload).text
          : extractResponsesDelta(payload);
        finalUsage = extractUsage(payload) ?? finalUsage;
        const reasoningDelta = mode === "chat_completions" ? extractChatDelta(payload).reasoning : undefined;
        const toolCalls = (mode === "chat_completions" ? extractChatToolCalls(payload) : extractResponsesToolCalls(payload)) ?? [];
        if (delta || reasoningDelta || toolCalls.length) {
          yield {
            sessionId: input.sessionId,
            messageId,
            delta,
            done: false,
            ...(reasoningDelta ? { reasoningDelta } : {}),
            ...(toolCalls.length ? { toolCalls } : {}),
          };
        }
      }
    }

    if (done) {
      yield { sessionId: input.sessionId, messageId, delta: "", done: true, ...(finalUsage ? { usage: finalUsage } : {}) };
      return;
    }
  }
}

async function buildResponseInput(input: StreamSessionInput, documentResolver?: StreamSessionDependencies["documentResolver"]): Promise<OpenAIResponseInputMessage[]> {
  const messages = [];
  for (const message of input.messages) {
    const assets = documentResolver && message.documents?.length
      ? await documentResolver(message.documents)
      : [];
    messages.push({ ...message, assets });
  }
  return buildOpenAIResponseMessages({
    systemPrompt: input.systemPrompt,
    contextBlocks: input.contextBlocks,
    messages,
  });
}

function buildChatTools(): Array<Record<string, unknown>> {
  return [
    {
      type: "function",
      function: {
        name: "list_dir",
        description: "List files and directories inside the workspace.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "Workspace-relative path to list." },
          },
        },
      },
    },
    {
      type: "function",
      function: {
        name: "read_file",
        description: "Read a UTF-8 text file inside the workspace.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "Workspace-relative file path to read." },
          },
          required: ["path"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "write_file",
        description: "Write a UTF-8 text file inside the workspace.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "Workspace-relative file path to write." },
            content: { type: "string", description: "Text content to write." },
          },
          required: ["path", "content"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "shell",
        description: "Run a shell command in the workspace.",
        parameters: {
          type: "object",
          properties: {
            command: { type: "string", description: "Shell command to run." },
          },
          required: ["command"],
        },
      },
    },
  ];
}

function buildResponseTools(): Array<Record<string, unknown>> {
  return buildChatTools().map((tool) => {
    const fn = tool.function as Record<string, unknown>;
    return {
      type: "function",
      name: fn.name,
      description: fn.description,
      parameters: fn.parameters,
    };
  });
}

export async function* streamClawRuntimeGatewayChunks(
  input: StreamSessionInput,
  fetchImpl: typeof fetch,
  gatewayConfig: SessionGatewayDescriptor,
  dependencies: StreamSessionDependencies,
): AsyncGenerator<StreamChunk> {
  const config = resolveClawRuntimeConfig({
    adapter: "claw",
    provider: gatewayConfig.provider,
    model: input.model ?? gatewayConfig.model,
    wire: gatewayConfig.wire,
    baseUrl: gatewayConfig.url,
    secretRef: gatewayConfig.secretRef,
    envKey: gatewayConfig.envKey,
    headers: gatewayConfig.headers,
    permissionMode: gatewayConfig.permissionMode,
    env: gatewayConfig.env,
  });

  if (config.authSource === "missing") {
    throw new Error(`Missing API key for ${config.provider.label}. Set ${config.provider.envKey} or configure a Secrets secret reference.`);
  }

  if (config.wire === "responses") {
    const body = {
      model: input.model || config.model,
      user: input.sessionId,
      input: await buildResponseInput(input, dependencies.documentResolver),
      tools: buildResponseTools(),
      stream: true,
    };
    yield* streamSseResponse(await postJson(fetchImpl, gatewayConfig, body, "/responses"), input, "responses");
    return;
  }

  const body = {
    model: input.model || config.model,
    messages: buildOpenAIMessages({
      systemPrompt: input.systemPrompt,
      contextBlocks: input.contextBlocks,
      messages: input.messages,
    }) as OpenAIChatMessage[],
    tools: buildChatTools(),
    stream: true,
  };
  yield* streamSseResponse(await postJson(fetchImpl, gatewayConfig, body, "/chat/completions"), input, "chat_completions");
}

function resolveWorkspacePath(inputPath: string, workspacePath: string): string {
  const resolved = path.resolve(workspacePath, inputPath);
  const root = path.resolve(workspacePath);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error("Path is outside the Claw Runtime workspace.");
  }
  return resolved;
}

export async function executeClawRuntimeTool(input: {
  name: string;
  arguments: Record<string, unknown>;
  workspacePath: string;
  permissionMode: ClawRuntimePermissionMode;
}): Promise<string> {
  const args = input.arguments;
  if (input.name === "list_dir") {
    const target = resolveWorkspacePath(typeof args.path === "string" ? args.path : ".", input.workspacePath);
    return JSON.stringify(fs.readdirSync(target, { withFileTypes: true }).map((entry) => ({
      name: entry.name,
      kind: entry.isDirectory() ? "directory" : entry.isFile() ? "file" : "other",
    })));
  }
  if (input.name === "read_file") {
    const target = resolveWorkspacePath(typeof args.path === "string" ? args.path : "", input.workspacePath);
    return fs.readFileSync(target, "utf8");
  }
  if (input.name === "write_file") {
    if (input.permissionMode === "read-only") throw new Error("write_file requires workspace-write permission.");
    const target = resolveWorkspacePath(typeof args.path === "string" ? args.path : "", input.workspacePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, typeof args.content === "string" ? args.content : "");
    return "ok";
  }
  if (input.name === "shell") {
    if (input.permissionMode === "read-only") throw new Error("shell requires workspace-write permission.");
    const command = typeof args.command === "string" ? args.command : "";
    if (!command.trim()) throw new Error("shell command is required.");
    return await new Promise((resolve, reject) => {
      const child = spawn(command, {
        shell: true,
        cwd: input.workspacePath,
        env: process.env,
      });
      let stdout = "";
      let stderr = "";
      child.stdout?.on("data", (chunk) => { stdout += chunk.toString(); });
      child.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });
      child.on("error", reject);
      child.on("close", (code) => {
        resolve([stdout.trim(), stderr.trim(), `exitCode=${code ?? 0}`].filter(Boolean).join("\n"));
      });
    });
  }
  throw new Error(`Unsupported Claw Runtime tool: ${input.name}`);
}
