import fs from "fs";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";
import { createInterface } from "node:readline/promises";

import {
  CLAW_RUNTIME_PROVIDERS,
  NodeProcessHost,
  ensureHttpSecretReference,
  executeClawRuntimeTool,
  getRuntimeAdapter,
  getRuntimeSessionDescriptor,
  listClawRuntimeModels,
  resolveClawRuntimeConfig,
  resolveClawRuntimeLocations,
  streamRuntimeSessionEvents,
  type ClawRuntimePermissionMode,
  type ClawRuntimeWire,
  type RuntimeAdapterOptions,
} from "@clawjs/claw";

export interface ChatCliContext {
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
  cwd: string;
  binName: string;
}

export interface ChatCliInput {
  argv: string[];
  positionals: string[];
  flags: Record<string, string>;
  wantsJson: boolean;
  context: ChatCliContext;
}

export const CHAT_EXIT_OK = 0;
export const CHAT_EXIT_FAILURE = 1;
export const CHAT_EXIT_DEGRADED = 2;
export const CHAT_EXIT_USAGE = 64;

type ChatRole = "user" | "assistant";

interface ChatMessageRecord {
  role: ChatRole;
  content: string;
  createdAt: string;
}

interface ChatSessionRecord {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  cwd: string;
  provider: string;
  model: string;
  wire: ClawRuntimeWire;
  sandbox: ClawRuntimePermissionMode;
  showReasoning: boolean;
  messages: ChatMessageRecord[];
}

interface ChatRuntimeSelection {
  provider: string;
  model: string;
  wire: ClawRuntimeWire;
  sandbox: ClawRuntimePermissionMode;
  baseUrl?: string;
  secretRef?: string;
  envKey?: string;
  homeDir?: string;
  configPath?: string;
  workspacePath: string;
}

const DEFAULT_PROVIDER = "deepseek";
const DEFAULT_MODEL = "deepseek-v4-pro";
const DEFAULT_DEEPSEEK_SECRET_REF = "claw_deepseek_api_key";
const DEEPSEEK_HOST = "api.deepseek.com";

function nowIso(): string {
  return new Date().toISOString();
}

function writeJson(stream: NodeJS.WritableStream, payload: unknown): void {
  stream.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function hasFlag(argv: string[], name: string): boolean {
  return argv.includes(`--${name}`);
}

function normalizeWire(value: string | undefined, fallback: ClawRuntimeWire): ClawRuntimeWire {
  return value === "responses" || value === "chat_completions" ? value : fallback;
}

function normalizeSandbox(value: string | undefined): ClawRuntimePermissionMode {
  if (value === "workspace-write" || value === "danger-full-access" || value === "read-only") return value;
  return "read-only";
}

function providerDefaults(providerId: string) {
  return CLAW_RUNTIME_PROVIDERS.find((provider) => provider.id === providerId) ?? CLAW_RUNTIME_PROVIDERS[0]!;
}

function readConfigFile(configPath: string): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(configPath, "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function writeRuntimeConfig(input: ChatRuntimeSelection): string {
  const locations = resolveClawRuntimeLocations({
    adapter: "claw",
    homeDir: input.homeDir,
    configPath: input.configPath,
    workspacePath: input.workspacePath,
    env: process.env,
  });
  const provider = providerDefaults(input.provider);
  const current = readConfigFile(locations.configPath);
  const next = {
    ...current,
    provider: input.provider,
    model: input.model,
    wire: input.wire,
    baseUrl: input.baseUrl ?? provider.baseUrl,
    envKey: input.envKey ?? provider.envKey,
    ...(input.secretRef ? { secretRef: input.secretRef } : {}),
    permissionMode: input.sandbox,
  };
  fs.mkdirSync(path.dirname(locations.configPath), { recursive: true });
  fs.writeFileSync(locations.configPath, `${JSON.stringify(next, null, 2)}\n`);
  return locations.configPath;
}

function chatHome(flags: Record<string, string>): string {
  return resolveClawRuntimeLocations({
    adapter: "claw",
    homeDir: flags["home-dir"],
    configPath: flags["config-path"],
    workspacePath: flags["runtime-workspace"],
    env: process.env,
  }).homeDir;
}

function sessionsDir(flags: Record<string, string>): string {
  return path.join(chatHome(flags), "chat", "sessions");
}

function sessionPath(flags: Record<string, string>, sessionId: string): string {
  return path.join(sessionsDir(flags), `${sessionId}.json`);
}

function readSession(flags: Record<string, string>, sessionId: string): ChatSessionRecord | null {
  try {
    return JSON.parse(fs.readFileSync(sessionPath(flags, sessionId), "utf8")) as ChatSessionRecord;
  } catch {
    return null;
  }
}

function saveSession(flags: Record<string, string>, session: ChatSessionRecord): void {
  session.updatedAt = nowIso();
  fs.mkdirSync(sessionsDir(flags), { recursive: true });
  fs.writeFileSync(sessionPath(flags, session.id), `${JSON.stringify(session, null, 2)}\n`);
}

function listSessions(flags: Record<string, string>): ChatSessionRecord[] {
  const dir = sessionsDir(flags);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((entry) => entry.endsWith(".json"))
    .map((entry) => readSession(flags, entry.replace(/\.json$/, "")))
    .filter((entry): entry is ChatSessionRecord => !!entry)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function initialPrompt(positionals: string[]): string {
  if (positionals[1] === "resume") {
    const first = positionals[2];
    return first === "last" || first?.startsWith("chat_")
      ? positionals.slice(3).join(" ").trim()
      : positionals.slice(2).join(" ").trim();
  }
  return positionals.slice(1).join(" ").trim();
}

function buildRuntimeSelection(input: ChatCliInput, existing?: ChatSessionRecord): ChatRuntimeSelection {
  const workspacePath = path.resolve(input.context.cwd, input.flags.workspace ?? input.context.cwd);
  const providerId = input.flags.provider ?? existing?.provider ?? DEFAULT_PROVIDER;
  const provider = providerDefaults(providerId);
  const model = input.flags.model ?? existing?.model ?? provider.models.find((entry) => entry.default)?.id ?? DEFAULT_MODEL;
  const wire = normalizeWire(input.flags.wire, existing?.wire ?? provider.wire);
  return {
    provider: providerId,
    model,
    wire,
    sandbox: normalizeSandbox(input.flags.sandbox ?? existing?.sandbox),
    ...(input.flags["base-url"] ? { baseUrl: input.flags["base-url"] } : {}),
    ...(input.flags["secret-ref"] ? { secretRef: input.flags["secret-ref"] } : {}),
    ...(input.flags["env-key"] ? { envKey: input.flags["env-key"] } : {}),
    ...(input.flags["home-dir"] ? { homeDir: input.flags["home-dir"] } : {}),
    ...(input.flags["config-path"] ? { configPath: input.flags["config-path"] } : {}),
    workspacePath,
  };
}

function buildRuntimeOptions(selection: ChatRuntimeSelection): RuntimeAdapterOptions {
  return {
    adapter: "claw",
    provider: selection.provider,
    model: selection.model,
    wire: selection.wire,
    baseUrl: selection.baseUrl,
    secretRef: selection.secretRef,
    envKey: selection.envKey,
    permissionMode: selection.sandbox,
    homeDir: selection.homeDir,
    configPath: selection.configPath,
    workspacePath: selection.workspacePath,
    env: process.env,
  };
}

function createSession(input: ChatCliInput): ChatSessionRecord {
  const selection = buildRuntimeSelection(input);
  const timestamp = nowIso();
  return {
    id: `chat_${randomUUID().slice(0, 12)}`,
    title: "New chat",
    createdAt: timestamp,
    updatedAt: timestamp,
    cwd: selection.workspacePath,
    provider: selection.provider,
    model: selection.model,
    wire: selection.wire,
    sandbox: selection.sandbox,
    showReasoning: hasFlag(input.argv, "show-reasoning"),
    messages: [],
  };
}

function resolveResumeSession(input: ChatCliInput): ChatSessionRecord | null {
  if (hasFlag(input.argv, "last")) {
    return listSessions(input.flags)[0] ?? null;
  }
  const requested = input.positionals[2] ?? (hasFlag(input.argv, "last") ? "last" : "");
  if (requested === "last" || requested === "--last" || !requested) {
    return listSessions(input.flags)[0] ?? null;
  }
  return readSession(input.flags, requested);
}

function writeHeader(context: ChatCliContext, session: ChatSessionRecord): void {
  context.stdout.write([
    "Claw Chat",
    `provider=${session.provider} model=${session.model} sandbox=${session.sandbox}`,
    `cwd=${session.cwd}`,
    `session=${session.id}`,
    "Type /help for commands.",
    "",
  ].join("\n"));
}

function formatSessionLine(session: ChatSessionRecord): string {
  return `${session.id}\t${session.updatedAt}\t${session.provider}/${session.model}\t${session.title}`;
}

async function askLine(prompt: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: !!process.stdin.isTTY });
  try {
    return await rl.question(prompt);
  } finally {
    rl.close();
  }
}

async function readPipedInputLines(): Promise<string[]> {
  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk.toString();
  }
  return input.split(/\r?\n/);
}

async function confirmTool(context: ChatCliContext, toolName: string, args: Record<string, unknown>, ask: (prompt: string) => Promise<string> = askLine): Promise<boolean> {
  context.stdout.write(`\nTool request: ${toolName} ${JSON.stringify(args)}\n`);
  const answer = (await ask("Allow? [y/N] ")).trim().toLowerCase();
  return answer === "y" || answer === "yes";
}

function parseToolArguments(raw: string | undefined): Record<string, unknown> {
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return { raw };
  }
}

async function executeToolCall(input: {
  context: ChatCliContext;
  session: ChatSessionRecord;
  tool: { id?: string; name?: string; arguments?: string };
  askLine?: (prompt: string) => Promise<string>;
}): Promise<string> {
  const name = input.tool.name?.trim() || "";
  const args = parseToolArguments(input.tool.arguments);
  const requiresWrite = name === "write_file" || name === "shell";
  if (!name) return "Tool call denied: missing tool name.";
  if (requiresWrite && input.session.sandbox === "read-only") {
    return `Tool ${name} denied: sandbox is read-only. Use /sandbox workspace-write to allow write or shell tools.`;
  }
  if (requiresWrite && !await confirmTool(input.context, name, args, input.askLine)) {
    return `Tool ${name} denied by user.`;
  }
  try {
    return await executeClawRuntimeTool({
      name,
      arguments: args,
      workspacePath: input.session.cwd,
      permissionMode: input.session.sandbox,
    });
  } catch (error) {
    return `Tool ${name} failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

async function runAssistantTurn(input: {
  context: ChatCliContext;
  flags: Record<string, string>;
  session: ChatSessionRecord;
  askLine?: (prompt: string) => Promise<string>;
}): Promise<void> {
  const runner = new NodeProcessHost();
  const adapter = getRuntimeAdapter("claw");
  const runtimeOptions = buildRuntimeOptions({
    provider: input.session.provider,
    model: input.session.model,
    wire: input.session.wire,
    sandbox: input.session.sandbox,
    workspacePath: input.session.cwd,
    ...(input.flags["base-url"] ? { baseUrl: input.flags["base-url"] } : {}),
    ...(input.flags["secret-ref"] ? { secretRef: input.flags["secret-ref"] } : {}),
    ...(input.flags["env-key"] ? { envKey: input.flags["env-key"] } : {}),
    ...(input.flags["home-dir"] ? { homeDir: input.flags["home-dir"] } : {}),
    ...(input.flags["config-path"] ? { configPath: input.flags["config-path"] } : {}),
  });
  const sessionAdapter = getRuntimeSessionDescriptor(adapter, runtimeOptions);
  const maxToolRounds = 4;

  for (let round = 0; round < maxToolRounds; round += 1) {
    let text = "";
    const toolCalls: Array<{ id?: string; name?: string; arguments?: string }> = [];
    input.context.stdout.write("assistant> ");
    try {
      for await (const event of streamRuntimeSessionEvents({
        sessionId: input.session.id,
        messages: input.session.messages.map((message) => ({ role: message.role, content: message.content })),
        transport: "gateway",
        model: input.session.model,
      }, { runner, sessionAdapter })) {
        if (event.type === "chunk") {
          if (event.chunk.reasoningDelta && input.session.showReasoning) {
            input.context.stdout.write(`\x1b[2m${event.chunk.reasoningDelta}\x1b[0m`);
          }
          if (event.chunk.delta) {
            text += event.chunk.delta;
            input.context.stdout.write(event.chunk.delta);
          }
          if (event.chunk.toolCalls?.length) {
            toolCalls.push(...event.chunk.toolCalls);
          }
        }
        if (event.type === "retry") {
          input.context.stdout.write(`\n[retry ${event.attempt}/${event.maxAttempts}: ${event.error.message}]\nassistant> `);
        }
        if (event.type === "error") throw event.error;
        if (event.type === "aborted") throw new Error(event.reason ?? "Session aborted");
      }
      input.context.stdout.write("\n");
    } catch (error) {
      input.context.stderr.write(`\n${formatProviderError(error)}\n`);
      return;
    }

    if (text.trim()) {
      input.session.messages.push({ role: "assistant", content: text.trim(), createdAt: nowIso() });
      input.session.title = input.session.messages.find((message) => message.role === "user")?.content.slice(0, 48) || input.session.title;
      saveSession(input.flags, input.session);
    }
    if (toolCalls.length === 0) return;

    const toolResults: string[] = [];
    for (const tool of toolCalls) {
      const result = await executeToolCall({ context: input.context, session: input.session, tool, askLine: input.askLine });
      toolResults.push(`Tool ${tool.name ?? "unknown"} result:\n${result}`);
    }
    input.session.messages.push({
      role: "user",
      content: toolResults.join("\n\n"),
      createdAt: nowIso(),
    });
    saveSession(input.flags, input.session);
  }
  input.context.stderr.write("Tool loop stopped after reaching the V1 round limit.\n");
}

function formatProviderError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("Missing API key")) {
    return [
      message,
      `Run: claw provider login ${DEFAULT_PROVIDER}`,
      `Or export: DEEPSEEK_API_KEY=...`,
    ].join("\n");
  }
  return message;
}

async function handleSlashCommand(input: {
  line: string;
  cli: ChatCliInput;
  session: ChatSessionRecord;
}): Promise<"continue" | "exit"> {
  const [command = "", ...rest] = input.line.slice(1).trim().split(/\s+/);
  const value = rest.join(" ").trim();
  switch (command) {
    case "help":
      input.cli.context.stdout.write("/help /exit /clear /status /provider <id> /model <id> /sandbox <mode> /resume <id|last>\n");
      return "continue";
    case "exit":
    case "quit":
      return "exit";
    case "clear":
      input.session.messages = [];
      saveSession(input.cli.flags, input.session);
      input.cli.context.stdout.write("cleared\n");
      return "continue";
    case "status":
      writeHeader(input.cli.context, input.session);
      return "continue";
    case "provider":
      if (value) input.session.provider = value;
      saveSession(input.cli.flags, input.session);
      input.cli.context.stdout.write(`provider=${input.session.provider}\n`);
      return "continue";
    case "model":
      if (value) input.session.model = value;
      saveSession(input.cli.flags, input.session);
      input.cli.context.stdout.write(`model=${input.session.model}\n`);
      return "continue";
    case "sandbox":
      input.session.sandbox = normalizeSandbox(value);
      saveSession(input.cli.flags, input.session);
      input.cli.context.stdout.write(`sandbox=${input.session.sandbox}\n`);
      return "continue";
    case "resume": {
      const target = value === "last" ? listSessions(input.cli.flags)[0] : readSession(input.cli.flags, value);
      if (!target) {
        input.cli.context.stderr.write(`session not found: ${value || "last"}\n`);
        return "continue";
      }
      Object.assign(input.session, target);
      writeHeader(input.cli.context, input.session);
      return "continue";
    }
    default:
      input.cli.context.stderr.write(`unknown command: /${command}\n`);
      return "continue";
  }
}

async function runInteractiveChat(input: ChatCliInput, session: ChatSessionRecord, prompt: string): Promise<number> {
  writeHeader(input.context, session);
  if (prompt) {
    session.messages.push({ role: "user", content: prompt, createdAt: nowIso() });
    saveSession(input.flags, session);
    await runAssistantTurn({ context: input.context, flags: input.flags, session });
    if (!process.stdin.isTTY) return CHAT_EXIT_OK;
  }

  if (!process.stdin.isTTY) {
    const lines = await readPipedInputLines();
    let index = 0;
    const ask = async (linePrompt: string) => {
      input.context.stdout.write(linePrompt);
      return lines[index++] ?? "";
    };
    while (index < lines.length) {
      const line = (await ask("user> ")).trim();
      if (!line) continue;
      if (line.startsWith("/")) {
        const result = await handleSlashCommand({ line, cli: input, session });
        if (result === "exit") break;
        continue;
      }
      session.messages.push({ role: "user", content: line, createdAt: nowIso() });
      saveSession(input.flags, session);
      await runAssistantTurn({ context: input.context, flags: input.flags, session, askLine: ask });
    }
    return CHAT_EXIT_OK;
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: !!process.stdin.isTTY });
  const ask = (linePrompt: string) => rl.question(linePrompt);
  try {
    while (true) {
      const line = (await ask("user> ")).trim();
      if (!line) continue;
      if (line.startsWith("/")) {
        const result = await handleSlashCommand({ line, cli: input, session });
        if (result === "exit") break;
        continue;
      }
      session.messages.push({ role: "user", content: line, createdAt: nowIso() });
      saveSession(input.flags, session);
      await runAssistantTurn({ context: input.context, flags: input.flags, session, askLine: ask });
    }
  } finally {
    rl.close();
  }
  return CHAT_EXIT_OK;
}

export async function runChatCli(input: ChatCliInput): Promise<number> {
  const command = input.positionals[1];
  if (hasFlag(input.argv, "help") || input.argv.includes("-h") || command === "help") {
    input.context.stdout.write([
      `Usage: ${input.context.binName} chat [prompt]`,
      `       ${input.context.binName} chat list`,
      `       ${input.context.binName} chat resume [--last|SESSION_ID]`,
      "",
    ].join("\n"));
    return CHAT_EXIT_OK;
  }
  if (command === "list") {
    const sessions = listSessions(input.flags);
    if (input.wantsJson) writeJson(input.context.stdout, { sessions });
    else input.context.stdout.write(`${sessions.map(formatSessionLine).join("\n")}${sessions.length ? "\n" : ""}`);
    return CHAT_EXIT_OK;
  }

  if (command === "resume") {
    const session = resolveResumeSession(input);
    if (!session) {
      input.context.stderr.write("No chat session found.\n");
      return CHAT_EXIT_FAILURE;
    }
    const selection = buildRuntimeSelection(input, session);
    session.provider = selection.provider;
    session.model = selection.model;
    session.wire = selection.wire;
    session.sandbox = selection.sandbox;
    session.cwd = selection.workspacePath;
    session.showReasoning = session.showReasoning || hasFlag(input.argv, "show-reasoning");
    return runInteractiveChat(input, session, initialPrompt(input.positionals));
  }

  const session = createSession(input);
  saveSession(input.flags, session);
  return runInteractiveChat(input, session, initialPrompt(input.positionals));
}

function providerUsage(binName: string): string {
  return [
    `Usage: ${binName} provider login <provider>`,
    `       ${binName} provider status`,
    `       ${binName} provider models`,
    `       ${binName} provider use <provider> --model MODEL`,
  ].join("\n");
}

function providerSelectionFromFlags(input: ChatCliInput, providerId: string): ChatRuntimeSelection {
  const provider = providerDefaults(providerId);
  return {
    provider: providerId,
    model: input.flags.model ?? provider.models.find((entry) => entry.default)?.id ?? DEFAULT_MODEL,
    wire: normalizeWire(input.flags.wire, provider.wire),
    sandbox: normalizeSandbox(input.flags.sandbox),
    ...(input.flags["base-url"] ? { baseUrl: input.flags["base-url"] } : { baseUrl: provider.baseUrl }),
    ...(input.flags["secret-ref"] ? { secretRef: input.flags["secret-ref"] } : {}),
    ...(input.flags["env-key"] ? { envKey: input.flags["env-key"] } : provider.envKey ? { envKey: provider.envKey } : {}),
    ...(input.flags["home-dir"] ? { homeDir: input.flags["home-dir"] } : {}),
    ...(input.flags["config-path"] ? { configPath: input.flags["config-path"] } : {}),
    workspacePath: path.resolve(input.context.cwd, input.flags.workspace ?? input.context.cwd),
  };
}

async function describeConfiguredVaultSecret(secretRef: string, input: ChatCliInput): Promise<"configured" | "missing" | "unknown"> {
  try {
    const runner = new NodeProcessHost();
    const result = await ensureHttpSecretReference(runner, {
      name: secretRef,
      kind: "generic",
      notes: "DeepSeek API key for Claw Runtime.",
      allowedHosts: [DEEPSEEK_HOST],
      allowedHeaderNames: ["Authorization"],
      readOnly: true,
    }, {
      env: {
        ...process.env,
        ...(input.flags["secrets-backend"] ? { CLAWJS_SECRETS_BACKEND: input.flags["secrets-backend"] } : {}),
        ...(input.flags["vault-url"] ? { VAULT_BASE_URL: input.flags["vault-url"] } : {}),
        ...(input.flags["vault-token"] ? { VAULT_TOKEN: input.flags["vault-token"] } : {}),
        ...(input.flags["vault-tenant-id"] ? { VAULT_TENANT_ID: input.flags["vault-tenant-id"] } : {}),
        ...(input.flags["vault-sidecar"] ? { CLAWJS_VAULT_SIDECAR_PATH: input.flags["vault-sidecar"] } : {}),
      },
    });
    return result.status === "configured" ? "configured" : "missing";
  } catch {
    return "unknown";
  }
}

function writeDeepSeekVaultInstructions(context: ChatCliContext, secretRef: string): void {
  context.stdout.write([
    `Secret required: ${secretRef}`,
    "Internal name: claw_deepseek_api_key",
    "Allowed hosts: api.deepseek.com",
    "Allowed headers: Authorization",
    "readOnly: true",
    `Open: ${path.join(os.homedir(), "Applications", "ClawJS Vault.app")}`,
    "Then rerun: claw provider login deepseek",
    "",
  ].join("\n"));
}

export async function runProviderCli(input: ChatCliInput): Promise<number> {
  const command = input.positionals[1];
  const providerId = input.positionals[2] ?? DEFAULT_PROVIDER;

  if (!command || command === "help") {
    input.context.stdout.write(`${providerUsage(input.context.binName)}\n`);
    return CHAT_EXIT_OK;
  }

  if (command === "models") {
    const selection = providerSelectionFromFlags(input, providerId);
    const models = listClawRuntimeModels(buildRuntimeOptions(selection));
    if (input.wantsJson) writeJson(input.context.stdout, { models });
    else input.context.stdout.write(`${models.map((model) => `${model.isDefault ? "*" : "-"} ${model.provider}/${model.modelId}`).join("\n")}\n`);
    return CHAT_EXIT_OK;
  }

  if (command === "use") {
    const selection = providerSelectionFromFlags(input, providerId);
    const configPath = writeRuntimeConfig(selection);
    if (input.wantsJson) writeJson(input.context.stdout, { provider: selection.provider, model: selection.model, configPath });
    else input.context.stdout.write(`${selection.provider}/${selection.model}\n`);
    return CHAT_EXIT_OK;
  }

  if (command === "status") {
    const selection = providerSelectionFromFlags(input, providerId);
    const config = resolveClawRuntimeConfig(buildRuntimeOptions(selection));
    const vaultStatus = config.provider.secretRef ? await describeConfiguredVaultSecret(config.provider.secretRef, input) : "unknown";
    const payload = {
      provider: config.provider.id,
      model: config.model,
      wire: config.wire,
      authSource: config.authSource,
      envKey: config.provider.envKey,
      secretRef: config.provider.secretRef ?? null,
      vaultStatus,
    };
    if (input.wantsJson) writeJson(input.context.stdout, payload);
    else input.context.stdout.write(`${payload.provider}:${payload.authSource}${payload.secretRef ? `:${payload.vaultStatus}` : ""}\n`);
    return config.authSource === "missing" || vaultStatus === "missing" ? CHAT_EXIT_DEGRADED : CHAT_EXIT_OK;
  }

  if (command === "login") {
    if (providerId !== "deepseek") {
      input.context.stderr.write("V1 provider login is implemented for deepseek.\n");
      return CHAT_EXIT_USAGE;
    }
    const secretRef = input.flags["secret-ref"] ?? DEFAULT_DEEPSEEK_SECRET_REF;
    const runner = new NodeProcessHost();
    let status: "configured" | "missing" | "update_required" | "unknown" = "unknown";
    try {
      const result = await ensureHttpSecretReference(runner, {
        name: secretRef,
        kind: "generic",
        notes: "DeepSeek API key for Claw Runtime.",
        allowedHosts: [DEEPSEEK_HOST],
        allowedHeaderNames: ["Authorization"],
        readOnly: true,
      }, {
        env: {
          ...process.env,
          ...(input.flags["secrets-backend"] ? { CLAWJS_SECRETS_BACKEND: input.flags["secrets-backend"] } : {}),
          ...(input.flags["vault-url"] ? { VAULT_BASE_URL: input.flags["vault-url"] } : {}),
          ...(input.flags["vault-token"] ? { VAULT_TOKEN: input.flags["vault-token"] } : {}),
          ...(input.flags["vault-tenant-id"] ? { VAULT_TENANT_ID: input.flags["vault-tenant-id"] } : {}),
          ...(input.flags["vault-sidecar"] ? { CLAWJS_VAULT_SIDECAR_PATH: input.flags["vault-sidecar"] } : {}),
        },
      });
      status = result.status;
    } catch {
      status = "missing";
    }

    const selection = providerSelectionFromFlags(input, "deepseek");
    if (status === "configured") {
      const configPath = writeRuntimeConfig({ ...selection, secretRef });
      if (input.wantsJson) writeJson(input.context.stdout, { provider: "deepseek", status, secretRef, configPath });
      else input.context.stdout.write(`deepseek vault configured\n`);
      return CHAT_EXIT_OK;
    }

    writeRuntimeConfig(selection);
    if (input.wantsJson) {
      writeJson(input.context.stdout, { provider: "deepseek", status, secretRef, configured: false });
    } else {
      input.context.stdout.write(`deepseek ${status}\n`);
      writeDeepSeekVaultInstructions(input.context, secretRef);
    }
    return CHAT_EXIT_DEGRADED;
  }

  input.context.stderr.write(`${providerUsage(input.context.binName)}\n`);
  return CHAT_EXIT_USAGE;
}
