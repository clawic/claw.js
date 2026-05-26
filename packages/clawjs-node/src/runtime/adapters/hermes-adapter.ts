import fs from "fs";
import path from "path";

import type {
  AuthState,
  ChannelDescriptor,
  DefaultModelRef,
  MemoryDescriptor,
  ModelCatalog,
  ModelDescriptor,
  PluginCatalog,
  ProviderAuthSummary,
  ProviderCatalog,
  ProviderDescriptor,
  RuntimeFileDescriptor,
  RuntimePluginDescriptor,
  SchedulerDescriptor,
  SkillDescriptor,
} from "@clawjs/core";
import { maskCredential } from "@clawjs/core";

import { createSimpleRuntimeAdapter } from "./simple-adapter.ts";
import type { CommandRunner, RuntimeAdapterOptions } from "../contracts.ts";

const HERMES_WORKSPACE_FILES: RuntimeFileDescriptor[] = [
  { key: "SOUL", path: "SOUL.md", required: true, visibleToUser: true, seedPolicy: "seed_if_missing" },
  { key: "USER", path: "USER.md", required: true, visibleToUser: true, seedPolicy: "seed_if_missing" },
  { key: "SKILLS", path: "SKILLS.md", required: true, visibleToUser: true, seedPolicy: "seed_if_missing" },
  { key: "IDENTITY", path: "IDENTITY.md", required: true, visibleToUser: true, seedPolicy: "seed_if_missing" },
  { key: "MEMORY", path: "MEMORY.md", required: true, visibleToUser: true, seedPolicy: "seed_if_missing" },
];

const HERMES_KNOWN_CHANNELS: Array<{ id: string; label: string; kind: ChannelDescriptor["kind"] }> = [
  { id: "telegram", label: "Telegram", kind: "chat" },
  { id: "discord", label: "Discord", kind: "chat" },
  { id: "slack", label: "Slack", kind: "chat" },
  { id: "whatsapp", label: "WhatsApp", kind: "chat" },
  { id: "signal", label: "Signal", kind: "chat" },
  { id: "email", label: "Email", kind: "email" },
  { id: "webhook", label: "Webhook", kind: "webhook" },
];

const HERMES_PROVIDER_IDS = [
  "nous",
  "openrouter",
  "openai",
  "anthropic",
  "gemini",
  "google-gemini-cli",
  "huggingface",
  "novita",
  "zai",
  "kimi-coding",
  "minimax",
  "kilocode",
  "xiaomi",
  "arcee",
  "gmi",
  "alibaba",
  "deepseek",
  "nvidia",
  "ollama-cloud",
  "xai",
  "bedrock",
  "opencode-zen",
  "opencode-go",
  "ai-gateway",
  "azure-foundry",
  "lmstudio",
  "stepfun",
  "tencent-tokenhub",
];

const HERMES_PROVIDERS: ProviderDescriptor[] = [
  ...HERMES_PROVIDER_IDS.map((id) => ({
    id,
    label: id,
    envVars: [`${id.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_API_KEY`],
    auth: {
      supportsApiKey: true,
      supportsEnv: true,
      supportsOAuth: ["anthropic", "nous", "openai", "xai", "qwen-oauth"].includes(id),
    },
  })),
];

interface HermesConfigSnapshot {
  path?: string;
  values: Record<string, string>;
  sections: Set<string>;
}

const HERMES_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,80}$/;
const HERMES_SECRET_KEY_PATTERN = /(^|[._-])(api[_-]?key|key|token|access[_-]?token|refresh[_-]?token|id[_-]?token|bearer[_-]?token|auth[_-]?token|bot[_-]?token|secret|client[_-]?secret|signing[_-]?secret|password|credential|credentials|private[_-]?key)([._-]|$)/i;
const HERMES_CAMEL_SECRET_KEY_PATTERN = /(apiKey|accessToken|refreshToken|idToken|bearerToken|authToken|botToken|clientSecret|signingSecret|privateKey)/;

function isSecretConfigKey(key: string): boolean {
  return HERMES_SECRET_KEY_PATTERN.test(key) || HERMES_CAMEL_SECRET_KEY_PATTERN.test(key);
}

function normalizeHermesProviderId(candidate: string | undefined): string | null {
  const normalized = candidate?.trim();
  if (!normalized || !HERMES_ID_PATTERN.test(normalized) || isSecretConfigKey(normalized)) return null;
  return normalized;
}

function addHermesProviderId(ids: Set<string>, candidate: string | undefined): void {
  const normalized = normalizeHermesProviderId(candidate);
  if (!normalized) return;
  ids.add(normalized);
}

function providerRefForModel(config: HermesConfigSnapshot, modelId: string): string | undefined {
  const candidate = modelId.includes("/")
    ? modelId.split("/")[0]
    : valueFor(config, ["provider", "default_provider", "defaultProvider"]);
  return normalizeHermesProviderId(candidate) ?? undefined;
}

function readHermesDirectory(dirPath: string | undefined): fs.Dirent[] {
  if (!dirPath) return [];
  try {
    return fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }
}

function readTextFile(filePath: string | undefined, maxBytes = 128 * 1024): string | null {
  if (!filePath) return null;
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size > maxBytes) return null;
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

function readJsonObject(filePath: string | undefined): Record<string, unknown> {
  const text = readTextFile(filePath);
  if (!text) return {};
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function parseScalar(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function flattenJson(value: unknown, prefix: string, output: Record<string, string>, sections: Set<string>): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    if (prefix && value !== undefined && value !== null) output[prefix] = String(value);
    return;
  }
  if (prefix) sections.add(prefix);
  for (const [key, child] of Object.entries(value)) {
    flattenJson(child, prefix ? `${prefix}.${key}` : key, output, sections);
  }
}

function parseHermesConfig(configPath: string | undefined): HermesConfigSnapshot {
  const text = readTextFile(configPath);
  const values: Record<string, string> = {};
  const sections = new Set<string>();
  if (!text) return { path: configPath, values, sections };
  try {
    const parsed = JSON.parse(text) as unknown;
    flattenJson(parsed, "", values, sections);
    return { path: configPath, values, sections };
  } catch {
    // Hermes uses YAML for normal config; this parser intentionally keeps only scalar metadata.
  }
  const stack: Array<{ indent: number; key: string }> = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const withoutComment = rawLine.replace(/\s+#.*$/, "");
    if (!withoutComment.trim() || withoutComment.trimStart().startsWith("#")) continue;
    const match = /^(\s*)([A-Za-z0-9_.-]+):(?:\s*(.*))?$/.exec(withoutComment);
    if (!match) continue;
    const indent = match[1]?.length ?? 0;
    const key = match[2] ?? "";
    const rawValue = match[3] ?? "";
    while (stack.length > 0 && stack[stack.length - 1]!.indent >= indent) stack.pop();
    const parts = [...stack.map((entry) => entry.key), key];
    const pathKey = parts.join(".");
    if (!rawValue.trim()) {
      sections.add(pathKey);
      stack.push({ indent, key });
      continue;
    }
    values[pathKey] = parseScalar(rawValue);
  }
  return { path: configPath, values, sections };
}

function valueFor(config: HermesConfigSnapshot, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = config.values[key];
    if (value?.trim()) return value.trim();
  }
  return undefined;
}

function boolFromConfig(value: string | undefined): boolean | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (["true", "yes", "on", "1", "enabled"].includes(normalized)) return true;
  if (["false", "no", "off", "0", "disabled"].includes(normalized)) return false;
  return null;
}

function titleize(value: string): string {
  return value
    .replace(/\.[^.]+$/, "")
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function fileUpdatedAt(filePath: string | undefined): string | undefined {
  if (!filePath) return undefined;
  try {
    return fs.statSync(filePath).mtime.toISOString();
  } catch {
    return undefined;
  }
}

function collectConfiguredProviderIds(config: HermesConfigSnapshot, authStorePath: string | undefined, env: NodeJS.ProcessEnv): Set<string> {
  const ids = new Set<string>(HERMES_PROVIDER_IDS);
  for (const key of Object.keys(config.values)) {
    const providerMatch = /^providers\.([A-Za-z0-9_-]+)(?:\.|$)/.exec(key);
    if (providerMatch?.[1]) addHermesProviderId(ids, providerMatch[1]);
    if (key === "provider" || key.endsWith(".provider")) addHermesProviderId(ids, config.values[key]);
  }
  const auth = readJsonObject(authStorePath);
  for (const key of Object.keys(auth.providers && typeof auth.providers === "object" ? auth.providers as Record<string, unknown> : auth)) {
    addHermesProviderId(ids, key);
  }
  for (const key of Object.keys(env)) {
    if (!key.endsWith("_API_KEY") || !env[key]) continue;
    addHermesProviderId(ids, key.replace(/_API_KEY$/, "").toLowerCase().replace(/_/g, "-"));
  }
  return ids;
}

function providerEnvVar(providerId: string): string {
  return `${providerId.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_API_KEY`;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function authCredentialFromStore(stored: unknown): { value: string; authType: "api_key" | "token" | "oauth" } | null {
  const raw = nonEmptyString(stored);
  if (raw) return { value: raw, authType: "api_key" };
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return null;
  const storedObject = stored as Record<string, unknown>;
  const apiKey = nonEmptyString(storedObject.apiKey) ?? nonEmptyString(storedObject.api_key) ?? nonEmptyString(storedObject.key);
  if (apiKey) return { value: apiKey, authType: "api_key" };
  const token = nonEmptyString(storedObject.token)
    ?? nonEmptyString(storedObject.accessToken)
    ?? nonEmptyString(storedObject.access_token)
    ?? nonEmptyString(storedObject.bearerToken)
    ?? nonEmptyString(storedObject.bearer_token);
  if (!token) return null;
  return {
    value: token,
    authType: nonEmptyString(storedObject.type) === "oauth" ? "oauth" : "token",
  };
}

function authCredentialFromConfig(config: HermesConfigSnapshot, providerId: string): { value: string; authType: "api_key" | "token" } | null {
  const apiKey = valueFor(config, [
    `providers.${providerId}.apiKey`,
    `providers.${providerId}.api_key`,
    `providers.${providerId}.key`,
  ]);
  if (apiKey) return { value: apiKey, authType: "api_key" };
  const token = valueFor(config, [
    `providers.${providerId}.token`,
    `providers.${providerId}.accessToken`,
    `providers.${providerId}.access_token`,
    `providers.${providerId}.bearerToken`,
    `providers.${providerId}.bearer_token`,
  ]);
  return token ? { value: token, authType: "token" } : null;
}

function buildHermesProviderCatalog(config: HermesConfigSnapshot, authStorePath: string | undefined, env: NodeJS.ProcessEnv): ProviderDescriptor[] {
  const ids = collectConfiguredProviderIds(config, authStorePath, env);
  return Array.from(ids)
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right))
    .map((id) => ({
      id,
      label: id,
      envVars: [providerEnvVar(id)],
      auth: {
        supportsApiKey: true,
        supportsEnv: true,
        supportsOAuth: ["anthropic", "nous", "openai", "xai", "qwen-oauth"].includes(id) || id.endsWith("-oauth"),
      },
    }));
}

function buildHermesProviderAuth(providers: ProviderDescriptor[], config: HermesConfigSnapshot, authStorePath: string | undefined, env: NodeJS.ProcessEnv): Record<string, ProviderAuthSummary> {
  const auth = readJsonObject(authStorePath);
  const authProviders = auth.providers && typeof auth.providers === "object" ? auth.providers as Record<string, unknown> : auth;
  return Object.fromEntries(providers.map((provider) => {
    const envName = providerEnvVar(provider.id);
    const envCredential = env[envName]?.trim() || null;
    const stored = authProviders[provider.id];
    const storedCredential = authCredentialFromStore(stored);
    const configCredential = authCredentialFromConfig(config, provider.id);
    const maskedCredential = maskCredential(storedCredential?.value ?? envCredential ?? configCredential?.value);
    return [provider.id, {
      provider: provider.id,
      hasAuth: !!storedCredential || !!envCredential || !!configCredential,
      hasSubscription: false,
      hasApiKey: storedCredential?.authType === "api_key" || !!envCredential || configCredential?.authType === "api_key",
      hasProfileApiKey: storedCredential?.authType === "api_key",
      hasEnvKey: !!envCredential,
      authType: storedCredential?.authType ?? (envCredential ? "env" : configCredential?.authType ?? null),
      maskedCredential,
      source: storedCredential ? "runtime" : envCredential ? "env" : configCredential ? "config" : "missing",
    } satisfies ProviderAuthSummary];
  }));
}

function defaultModelFromConfig(config: HermesConfigSnapshot): DefaultModelRef | null {
  const modelId = valueFor(config, [
    "model",
    "default_model",
    "defaultModel",
    "inference.model",
    "models.default",
    "providers.default.model",
    "auxiliary.compression.model",
  ]);
  if (!modelId) return null;
  const provider = providerRefForModel(config, modelId);
  return {
    provider,
    modelId,
    label: modelId,
  };
}

function listHermesModelsFromConfig(config: HermesConfigSnapshot): ModelDescriptor[] {
  const models = new Map<string, ModelDescriptor>();
  const fallback = defaultModelFromConfig(config);
  if (fallback) {
    models.set(fallback.modelId, {
      id: fallback.modelId,
      modelId: fallback.modelId,
      provider: fallback.provider ?? "default",
      label: fallback.label ?? fallback.modelId,
      available: true,
      isDefault: true,
      ref: fallback,
      source: "config",
    });
  }
  for (const [key, value] of Object.entries(config.values)) {
    if (!/(^|\.)(model|default_model|fallback_model)$/i.test(key)) continue;
    if (!value || value.includes("${") || isSecretConfigKey(key)) continue;
    const provider = providerRefForModel(config, value) ?? "default";
    models.set(value, {
      id: value,
      modelId: value,
      provider,
      label: value,
      available: true,
      isDefault: fallback?.modelId === value,
      ref: { provider, modelId: value, label: value },
      source: "config",
    });
  }
  return Array.from(models.values()).sort((left, right) => left.id.localeCompare(right.id));
}

function listHermesMemory(homeDir: string | undefined): MemoryDescriptor[] {
  const memoriesDir = homeDir ? path.join(homeDir, "memories") : undefined;
  const entries = readHermesDirectory(memoriesDir)
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => ({
      id: `hermes-memory-${entry.name.replace(/\.[^.]+$/, "").toLowerCase()}`,
      label: entry.name.replace(/\.[^.]+$/, ""),
      kind: "knowledge" as const,
      path: memoriesDir ? path.join(memoriesDir, entry.name) : undefined,
      summary: "Hermes memory file; content is not exposed by default.",
      updatedAt: fileUpdatedAt(memoriesDir ? path.join(memoriesDir, entry.name) : undefined),
    }));
  return entries;
}

function listHermesSkills(homeDir: string | undefined, config: HermesConfigSnapshot): SkillDescriptor[] {
  const skillsDir = homeDir ? path.join(homeDir, "skills") : undefined;
  const disabled = new Set(Object.entries(config.values)
    .filter(([key, value]) => key.startsWith("plugins.disabled") || key.startsWith("skills.disabled") || value === "disabled")
    .map(([key, value]) => value === "disabled" ? key.split(".").at(-2) ?? "" : value.replace(/[[\]",]/g, "").trim())
    .filter(Boolean));
  const entries = readHermesDirectory(skillsDir)
    .filter((entry) => entry.isDirectory() || entry.isFile())
    .map((entry) => ({
      id: entry.name.replace(/\.[^.]+$/, ""),
      label: titleize(entry.name),
      enabled: !disabled.has(entry.name.replace(/\.[^.]+$/, "")),
      scope: "runtime" as const,
      path: skillsDir ? path.join(skillsDir, entry.name) : undefined,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
  return entries;
}

function listHermesSchedulers(homeDir: string | undefined): SchedulerDescriptor[] {
  const cronDir = homeDir ? path.join(homeDir, "cron") : undefined;
  const entries = readHermesDirectory(cronDir)
    .filter((entry) => entry.isFile())
    .map((entry) => ({
      id: entry.name.replace(/\.[^.]+$/, ""),
      label: entry.name.replace(/\.[^.]+$/, ""),
      enabled: true,
      status: "idle" as const,
      kind: "cron" as const,
    }));
  return entries;
}

function listHermesChannels(config: HermesConfigSnapshot): ChannelDescriptor[] {
  return HERMES_KNOWN_CHANNELS.flatMap((channel) => {
    const matchingKeys = Object.keys(config.values).filter((key) => key.toLowerCase().includes(channel.id));
    const matchingSections = Array.from(config.sections).filter((key) => key.toLowerCase().includes(channel.id));
    if (matchingKeys.length === 0 && matchingSections.length === 0) return [];
    const enabled = boolFromConfig(
      valueFor(config, [
        `gateway.platforms.${channel.id}.enabled`,
        `platforms.${channel.id}.enabled`,
        `channels.${channel.id}.enabled`,
        `messaging.${channel.id}.enabled`,
        `${channel.id}.enabled`,
      ]),
    );
    return [{
      ...channel,
      status: enabled === false ? "disconnected" as const : "configured" as const,
      metadata: {
        source: "config",
        configKeys: matchingKeys.filter((key) => !isSecretConfigKey(key)).slice(0, 8),
      },
    }];
  });
}

function listHermesPlugins(homeDir: string | undefined, config: HermesConfigSnapshot): RuntimePluginDescriptor[] {
  const pluginDir = homeDir ? path.join(homeDir, "plugins") : undefined;
  const mcpDir = homeDir ? path.join(homeDir, "mcp") : undefined;
  const pluginEntries = readHermesDirectory(pluginDir)
    .filter((entry) => entry.isDirectory() || entry.isFile())
    .map((entry): RuntimePluginDescriptor => ({
      id: entry.name.replace(/\.[^.]+$/, ""),
      label: titleize(entry.name),
      enabled: true,
      status: "ready",
      metadata: {
        kind: "plugin",
        path: pluginDir ? path.join(pluginDir, entry.name) : undefined,
        source: "filesystem",
      },
    }));
  const mcpEntries = readHermesDirectory(mcpDir)
    .filter((entry) => entry.isDirectory() || entry.isFile())
    .map((entry): RuntimePluginDescriptor => ({
      id: `mcp-${entry.name.replace(/\.[^.]+$/, "")}`,
      label: `MCP ${titleize(entry.name)}`,
      enabled: true,
      status: "ready",
      metadata: {
        kind: "mcp_server",
        path: mcpDir ? path.join(mcpDir, entry.name) : undefined,
        source: "filesystem",
      },
    }));
  const configEntries = Object.keys(config.values)
    .filter((key) => key.startsWith("mcp.") || key.startsWith("mcp_servers.") || key.startsWith("plugins."))
    .filter((key) => !isSecretConfigKey(key))
    .map((key): RuntimePluginDescriptor => ({
      id: `config-${key.replace(/[^a-zA-Z0-9]+/g, "-")}`,
      label: titleize(key),
      enabled: !/disabled/i.test(key) && boolFromConfig(config.values[key]) !== false,
      status: "unknown",
      metadata: {
        kind: key.startsWith("mcp") ? "mcp_config" : "plugin_config",
        configKey: key,
        source: "config",
      },
    }));
  const byId = new Map<string, RuntimePluginDescriptor>();
  for (const entry of [...pluginEntries, ...mcpEntries, ...configEntries]) byId.set(entry.id, entry);
  return Array.from(byId.values()).sort((left, right) => left.id.localeCompare(right.id));
}

function hermesConfigFor(locations: { configPath?: string }): HermesConfigSnapshot {
  return parseHermesConfig(locations.configPath);
}

const baseHermesAdapter = createSimpleRuntimeAdapter({
  id: "hermes",
  runtimeName: "Hermes Agent",
  binary: "hermes",
  workspaceFiles: HERMES_WORKSPACE_FILES,
  homeDirName: ".hermes",
  configFileName: "config.yaml",
  authFileName: "auth.json",
  providerCatalog: HERMES_PROVIDERS,
  defaultModelKeys: ["defaultModel", "model"],
  loginArgs: () => ["auth"],
  repairCommand: { command: "hermes", args: ["doctor"] },
  setupCommand: () => ({ command: "hermes", args: ["setup"] }),
  probeCommands: {
    scheduler: ["cron", "status"],
    channels: ["gateway", "status"],
    skills: ["skills", "list"],
    memory: ["memory", "status"],
    plugins: ["plugins", "list"],
    sandbox: ["tools", "--summary"],
    doctor: ["status", "--all"],
  },
  gatewaySupport: true,
  gatewayKind: "openai-chat-completions",
  conversationDetails: (_options, locations) => ({
    primaryTransport: "gateway",
    fallbackTransport: "cli",
    sessionPersistence: "runtime",
    streamingMode: "hybrid",
    sessionPath: locations.homeDir ? path.join(locations.homeDir, "sessions") : undefined,
    sessionDatabasePath: locations.homeDir ? path.join(locations.homeDir, "state.db") : undefined,
    sessionTranscriptPath: locations.homeDir ? path.join(locations.homeDir, "sessions") : undefined,
    sessionIndexPath: locations.homeDir ? path.join(locations.homeDir, "sessions", "sessions.json") : undefined,
    sessionStorageContract: "sqlite_with_gateway_transcripts",
  }),
  capabilityDeclarations: {
    runtime: { supported: true, status: "ready", strategy: "cli" },
    auth: { supported: true, status: "degraded", strategy: "config", limitations: ["Hermes auth state may come from ~/.hermes/auth.json and environment-backed secrets."] },
    models: { supported: true, status: "ready", strategy: "cli" },
    scheduler: { supported: true, status: "ready", strategy: "native", limitations: ["Scheduler inventory is read from ~/.hermes/cron when available and falls back to runtime probing."] },
    memory: { supported: true, status: "ready", strategy: "bridge", limitations: ["Memory inventory is mapped from ~/.hermes/memories and session storage."] },
    channels: { supported: true, status: "degraded", strategy: "native", limitations: ["Channel inventory is normalized to the ClawJS descriptor model and may omit platform-specific metadata."] },
    skills: { supported: true, status: "ready", strategy: "native", limitations: ["Skill inventory is read from ~/.hermes/skills and does not expose all Hermes skill metadata yet."] },
    sandbox: { supported: true, status: "degraded", strategy: "hosted", limitations: ["Isolation depends on the selected Hermes terminal backend such as Docker, SSH, Modal, or local."] },
    plugins: { supported: true, status: "degraded", strategy: "native", limitations: ["Plugin and MCP inventory is projected from Hermes config and filesystem metadata without enabling or installing plugins."] },
    session_gateway: { supported: true, status: "ready", strategy: "gateway" },
  },
  capabilityOverrides: {
    scheduler: { supported: true, status: "ready", strategy: "native" },
    memory: { supported: true, status: "ready", strategy: "bridge" },
    channels: { supported: true, status: "degraded", strategy: "native", limitations: ["Channel inventory is normalized from Hermes gateway capabilities."] },
    skills: { supported: true, status: "ready", strategy: "native" },
    session_gateway: { supported: true, status: "ready", strategy: "gateway" },
    sandbox: { supported: true, status: "degraded", strategy: "hosted", limitations: ["Sandboxing depends on the configured terminal backend."] },
    plugins: { supported: true, status: "degraded", strategy: "native", limitations: ["Hermes plugins, MCP servers, tools, hooks, and Computer Use are inventoried read-only."] },
  },
  resourceLoaders: {
    async listProviders(_runner, options, locations) {
      return buildHermesProviderCatalog(hermesConfigFor(locations), locations.authStorePath, options.env ?? process.env);
    },
    async listModels(_runner, _options, locations) {
      return listHermesModelsFromConfig(hermesConfigFor(locations));
    },
    async listSchedulers(_runner, _options, locations) {
      return listHermesSchedulers(locations.homeDir);
    },
    async listMemory(_runner, _options, locations) {
      return listHermesMemory(locations.homeDir);
    },
    async listSkills(_runner, _options, locations) {
      return listHermesSkills(locations.homeDir, hermesConfigFor(locations));
    },
    async listChannels(_runner, _options, locations) {
      return listHermesChannels(hermesConfigFor(locations));
    },
  },
  conversationCli: (input) => ({
    command: "hermes",
    args: ["chat", "--source", "tool", "--quiet", "--pass-session-id", "--resume", input.sessionId, "--query", input.prompt],
    timeoutMs: 130_000,
    parser: "stdout-text",
  }),
});

export const hermesAdapter = {
  ...baseHermesAdapter,
  async getProviderCatalog(runner: CommandRunner, options: RuntimeAdapterOptions): Promise<ProviderCatalog> {
    const locations = baseHermesAdapter.resolveLocations(options);
    return { providers: buildHermesProviderCatalog(hermesConfigFor(locations), locations.authStorePath, options.env ?? process.env) };
  },
  async listProviders(runner: CommandRunner, options: RuntimeAdapterOptions): Promise<ProviderDescriptor[]> {
    return (await this.getProviderCatalog(runner, options)).providers;
  },
  async getModelCatalog(_runner: CommandRunner, options: RuntimeAdapterOptions): Promise<ModelCatalog> {
    const locations = baseHermesAdapter.resolveLocations(options);
    const config = hermesConfigFor(locations);
    return {
      models: listHermesModelsFromConfig(config),
      defaultModel: defaultModelFromConfig(config),
    };
  },
  async listModels(runner: CommandRunner, options: RuntimeAdapterOptions): Promise<ModelDescriptor[]> {
    return (await this.getModelCatalog(runner, options)).models;
  },
  async getDefaultModel(_runner: CommandRunner, options: RuntimeAdapterOptions): Promise<DefaultModelRef | null> {
    return defaultModelFromConfig(hermesConfigFor(baseHermesAdapter.resolveLocations(options)));
  },
  async setDefaultModel(): Promise<string> {
    throw new Error("Hermes default model write-back is blocked; use the official `hermes model` or dashboard flow.");
  },
  async getProviderAuth(runner: CommandRunner, options: RuntimeAdapterOptions): Promise<Record<string, ProviderAuthSummary>> {
    const locations = baseHermesAdapter.resolveLocations(options);
    const config = hermesConfigFor(locations);
    return buildHermesProviderAuth(await this.listProviders(runner, options), config, locations.authStorePath, options.env ?? process.env);
  },
  async getAuthState(runner: CommandRunner, options: RuntimeAdapterOptions): Promise<AuthState> {
    const locations = baseHermesAdapter.resolveLocations(options);
    return {
      providers: await this.getProviderAuth(runner, options),
      diagnostics: {
        locations,
        secretPolicy: "redacted_presence_only",
      },
    };
  },
  async listChannels(_runner: CommandRunner, options: RuntimeAdapterOptions): Promise<ChannelDescriptor[]> {
    return listHermesChannels(hermesConfigFor(baseHermesAdapter.resolveLocations(options)));
  },
  async listSkills(_runner: CommandRunner, options: RuntimeAdapterOptions): Promise<SkillDescriptor[]> {
    const locations = baseHermesAdapter.resolveLocations(options);
    return listHermesSkills(locations.homeDir, hermesConfigFor(locations));
  },
  async listMemory(_runner: CommandRunner, options: RuntimeAdapterOptions): Promise<MemoryDescriptor[]> {
    return listHermesMemory(baseHermesAdapter.resolveLocations(options).homeDir);
  },
  async listSchedulers(_runner: CommandRunner, options: RuntimeAdapterOptions): Promise<SchedulerDescriptor[]> {
    return listHermesSchedulers(baseHermesAdapter.resolveLocations(options).homeDir);
  },
  resources: {
    ...baseHermesAdapter.resources!,
    async getProviderCatalog(runner: CommandRunner, options: RuntimeAdapterOptions): Promise<ProviderCatalog> {
      return hermesAdapter.getProviderCatalog(runner, options);
    },
    async listProviders(runner: CommandRunner, options: RuntimeAdapterOptions): Promise<ProviderDescriptor[]> {
      return hermesAdapter.listProviders(runner, options);
    },
    async getModelCatalog(runner: CommandRunner, options: RuntimeAdapterOptions): Promise<ModelCatalog> {
      return hermesAdapter.getModelCatalog(runner, options);
    },
    async listModels(runner: CommandRunner, options: RuntimeAdapterOptions): Promise<ModelDescriptor[]> {
      return hermesAdapter.listModels(runner, options);
    },
    async getDefaultModel(runner: CommandRunner, options: RuntimeAdapterOptions): Promise<DefaultModelRef | null> {
      return hermesAdapter.getDefaultModel(runner, options);
    },
    async getAuthState(runner: CommandRunner, options: RuntimeAdapterOptions): Promise<AuthState> {
      return hermesAdapter.getAuthState(runner, options);
    },
    async getProviderAuth(runner: CommandRunner, options: RuntimeAdapterOptions): Promise<Record<string, ProviderAuthSummary>> {
      return hermesAdapter.getProviderAuth(runner, options);
    },
    async getPluginCatalog(_runner: CommandRunner, options: RuntimeAdapterOptions): Promise<PluginCatalog> {
      const locations = baseHermesAdapter.resolveLocations(options);
      return { plugins: listHermesPlugins(locations.homeDir, hermesConfigFor(locations)) };
    },
  },
};
