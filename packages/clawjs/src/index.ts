import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

import {
  buildSetDefaultModelCommand,
  createClaw,
  discoverWorkspaces,
  getRuntimeAdapter,
  redactSecrets,
} from "@clawjs/claw";
import type { TelegramSendMediaInput, TelegramSendMessageInput } from "@clawjs/claw";
import { createWorkspaceClaw } from "@clawjs/workspace";
import type { RuntimeAdapterId, TemporalItem } from "@clawjs/core";
import {
  addProjectIntegration,
  collectProjectInfo,
  generateProjectResource,
  locateProjectRoot,
  readProjectConfig,
  type ClawIntegrationType,
  type ClawProjectType,
  type ClawResourceType,
} from "./project.ts";
import {
  createPackageName,
  createPascalCase,
  createTitle,
  detectPackageManager,
  scaffoldProject,
  type SupportedPackageManager,
} from "./scaffold.ts";

export interface CliContext {
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
  cwd: string;
  binName?: string;
  runCommand?: (command: string, args: string[], options: { cwd: string }) => Promise<void>;
}

export const CLI_EXIT_OK = 0;
export const CLI_EXIT_FAILURE = 1;
export const CLI_EXIT_DEGRADED = 2;
export const CLI_EXIT_USAGE = 64;
export const DEFAULT_CLI_BIN = "claw";

export function buildCliUsage(binName = DEFAULT_CLI_BIN): string {
  return [
    `Usage: ${binName} <command> [options]`,
    "",
    "Productivity commands:",
    `  ${binName} new app|agent|server|workspace|skill|plugin <name> [--dir PATH] [--template NAME] [--package-manager npm|pnpm] [--git] [--install] [--yes]`,
    `  ${binName} generate skill|plugin|provider|channel|command <name> [--project PATH]`,
    `  ${binName} add provider|channel|telegram|scheduler|memory|workspace [name] [--project PATH]`,
    `  ${binName} info [--project PATH] [--json]`,
    `  ${binName} doctor [--workspace PATH] [--json]`,
    "",
    "Advanced command groups:",
    `  ${binName} runtime status|install|uninstall|repair|setup-workspace`,
    `  ${binName} workspace init|attach|inspect|discover|validate|reset|repair`,
    `  ${binName} files read|write|inspect|diff|sync|apply-template-pack`,
    `  ${binName} auth status|login|remove`,
    `  ${binName} models list|default|set-default`,
    `  ${binName} providers list|catalog|auth-state`,
    `  ${binName} secrets list|describe|types|capabilities|broker http|leases list`,
    `  ${binName} scheduler list|run|enable|disable`,
    `  ${binName} time list|get|create|update|delete|pause|resume|run|executions|calendar|timeline`,
    `  ${binName} schedule at|every|after ...`,
    `  ${binName} memory list|status|inspect|search`,
    `  ${binName} tasks list|get|create|update|complete|search`,
    `  ${binName} goals list|get|create|update|delete|search`,
    `  ${binName} projects list|get|create|update|delete|search`,
    `  ${binName} reminders list|get|create|update|pause|resume|delete|search`,
    `  ${binName} deadlines list|get|create|update|pause|resume|delete|search`,
    `  ${binName} notes list|get|create|update|search`,
    `  ${binName} people list|get|upsert|search`,
    `  ${binName} inbox list|read|search|draft|archive`,
    `  ${binName} events list|get|create|update|search`,
    `  ${binName} workspace-search query`,
    `  ${binName} workspace-index rebuild`,
    `  ${binName} skills list|inspect|sync|sources|search|install`,
    `  ${binName} channels list|status`,
    `  ${binName} browser status|ensure|share --relay-url URL --access-token TOKEN --tenant-id ID --agent-id ID --workspace-id ID`,
    `  ${binName} telegram connect|status|webhook set|clear|polling start|stop|commands set|get|chats list|inspect|send`,
    `  ${binName} sessions create|list|search|read|stream|generate-title`,
    `  ${binName} documents list|read|search|upload|register|download`,
    `  ${binName} inference generate-text`,
    `  ${binName} tts synthesize|config|set-config|providers|catalog`,
    `  ${binName} image generate|list|read|delete|backends`,
    `  ${binName} audio generate|list|read|delete|backends`,
    `  ${binName} video generate|list|read|delete|backends`,
    `  ${binName} generations backends|register-command|remove-backend|create|list|read|delete`,
    `  ${binName} notify send|cancel|subscriptions upsert|delete`,
    `  ${binName} database serve|login|namespace|collection|record|token|file`,
    `  ${binName} content serve|login|brand|destination|campaign|entry|variant|approval|publish|token`,
    `  ${binName} erp serve|login|tenant|company|localization|gl|ar|ap|sales|purchase|inventory|mrp|projects|hr|payroll|support|docs|reports|agents|approvals`,
    `  ${binName} iot serve|homes|areas|things|state|lights|climate|scenes|automations|approvals|raw`,
    `  ${binName} compat [--refresh] [--json]`,
    "",
    "Global options:",
    "  --runtime demo|openclaw|zeroclaw|picoclaw|nanobot|nanoclaw|nullclaw|ironclaw|nemoclaw|hermes",
    "  --workspace PATH",
    "  --json",
    "  --dry-run",
  ].join("\n");
}

export const CLI_USAGE = buildCliUsage();

const CLI_TEMPLATE_ROOT = fileURLToPath(new URL("../templates", import.meta.url));

function writeJson(stream: NodeJS.WritableStream, payload: unknown): void {
  stream.write(`${JSON.stringify(redactSecrets(payload), null, 2)}\n`);
}

function writeJsonLine(stream: NodeJS.WritableStream, payload: unknown): void {
  stream.write(`${JSON.stringify(redactSecrets(payload))}\n`);
}

function parseContextBlock(value?: string): { title: string; content: string }[] | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  const separatorIndex = trimmed.indexOf("::");
  if (separatorIndex === -1) {
    return [{ title: "Context", content: trimmed }];
  }
  return [{
    title: trimmed.slice(0, separatorIndex).trim() || "Context",
    content: trimmed.slice(separatorIndex + 2).trim(),
  }];
}

function parseJsonFlag<TValue>(value: string | undefined, label: string): TValue | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed) as TValue;
  } catch (error) {
    throw new Error(`Invalid JSON for ${label}: ${error instanceof Error ? error.message : "parse error"}`);
  }
}

function parseCsvFlag(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function writeProgress(stream: NodeJS.WritableStream, event: { phase: string; status: string; percent?: number; message?: string }): void {
  const suffix = typeof event.percent === "number" ? ` ${event.percent}%` : "";
  const message = event.message ? ` ${event.message}` : "";
  stream.write(`${event.phase} ${event.status}${suffix}${message}\n`);
}

function parseFlags(argv: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith("--")) continue;
    const equalsIndex = token.indexOf("=");
    if (equalsIndex > 2) {
      flags[token.slice(2, equalsIndex)] = token.slice(equalsIndex + 1);
      continue;
    }
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) continue;
    flags[token.slice(2)] = next;
  }
  return flags;
}

function readBooleanFlag(argv: string[], flags: Record<string, string>, name: string, fallback = false): boolean {
  if (argv.includes(`--${name}`)) return true;
  const value = flags[name];
  if (value === undefined) return fallback;
  return value === "true";
}

function extractPositionals(argv: string[]): string[] {
  const positionals: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith("--")) {
      positionals.push(token);
      continue;
    }
    if (token.includes("=")) continue;
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      index += 1;
    }
  }
  return positionals;
}

function pathSafeBasename(value: string): string {
  const normalized = value.replace(/\/+$/, "");
  const parts = normalized.split("/");
  return parts[parts.length - 1] || "clawjs-workspace";
}

function resolveRuntimeAdapterId(flags: Record<string, string>): RuntimeAdapterId {
  return (flags.runtime?.trim() || "openclaw") as RuntimeAdapterId;
}

type MediaKind = "image" | "audio" | "video";

function inferMimeTypeFromPath(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case ".txt":
      return "text/plain";
    case ".md":
      return "text/markdown";
    case ".json":
      return "application/json";
    case ".csv":
      return "text/csv";
    case ".pdf":
      return "application/pdf";
    case ".docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    default:
      return "application/octet-stream";
  }
}

function inferAudioExtension(mimeType: string): string {
  switch (mimeType) {
    case "audio/mpeg":
      return ".mp3";
    case "audio/wav":
      return ".wav";
    default:
      return ".bin";
  }
}

function parseInferenceMessages(
  flags: Record<string, string>,
): Array<{ role: "user" | "system" | "assistant" | "tool"; content: string }> | null {
  const parsed = parseJsonFlag<Array<{ role: "user" | "system" | "assistant" | "tool"; content: string }>>(flags["messages-json"], "--messages-json");
  if (parsed?.length) {
    return parsed;
  }
  const prompt = flags.prompt ?? flags.message ?? flags.text;
  if (!prompt?.trim()) {
    return null;
  }
  return [{ role: "user", content: prompt.trim() }];
}

function buildMediaMetadata(
  kind: MediaKind,
  flags: Record<string, string>,
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  const merged: Record<string, unknown> = { ...(metadata ?? {}) };

  if (kind === "image") {
    if (flags.size) merged.size = flags.size;
    if (flags.quality) merged.quality = flags.quality;
    if (flags.background) merged.background = flags.background;
    if (flags["output-format"]) merged.outputFormat = flags["output-format"];
    if (flags.style) merged.style = flags.style;
    if (flags.resolution) merged.resolution = flags.resolution;
    if (flags["aspect-ratio"]) merged.aspectRatio = flags["aspect-ratio"];
    const inputImages = parseCsvFlag(flags["input-images"]);
    if (inputImages.length > 0) merged.inputImages = inputImages;
  }

  if (kind === "audio" && flags.voice) {
    merged.voice = flags.voice;
  }

  return Object.keys(merged).length > 0 ? merged : undefined;
}

async function createCliClaw(
  runtimeAdapter: RuntimeAdapterId,
  flags: Record<string, string>,
  workspaceRoot: string,
  appId: string,
  workspaceId: string,
  agentId: string,
) {
  const explicitVaultBackend = flags["vault-url"] || flags["vault-token"] || flags["vault-tenant-id"] ? "vault" : undefined;
  return createClaw({
    runtime: {
      adapter: runtimeAdapter,
      agentDir: flags["agent-dir"],
      homeDir: flags["home-dir"],
      configPath: flags["config-path"],
      workspacePath: flags["runtime-workspace"],
      authStorePath: flags["auth-store"],
      gateway: {
        url: flags["gateway-url"],
        token: flags["gateway-token"],
        ...(flags["gateway-port"] ? { port: Number(flags["gateway-port"]) } : {}),
        configPath: flags["gateway-config"],
      },
    },
    workspace: {
      appId,
      workspaceId,
      agentId,
      rootDir: workspaceRoot,
    },
    secrets: (
      flags["secrets-backend"]
      || flags["vault-url"]
      || flags["vault-token"]
      || flags["vault-tenant-id"]
      || process.env.CLAWJS_SECRETS_BACKEND
      || process.env.VAULT_BASE_URL
      || process.env.VAULT_TOKEN
      || process.env.VAULT_TENANT_ID
    ) ? {
      backend: (flags["secrets-backend"] || explicitVaultBackend || process.env.CLAWJS_SECRETS_BACKEND) as "local_proxy" | "vault" | undefined,
      baseUrl: flags["vault-url"] || process.env.VAULT_BASE_URL,
      credential: flags["vault-token"] || process.env.VAULT_TOKEN,
      tenantId: flags["vault-tenant-id"] || process.env.VAULT_TENANT_ID,
      sidecarPath: flags["vault-sidecar"] || process.env.CLAWJS_VAULT_SIDECAR_PATH,
    } : undefined,
    templates: {
      pack: flags["template-pack"],
    },
    notify: flags["notify-url"]
      ? {
        baseUrl: flags["notify-url"],
        sourceToken: flags["notify-source-token"],
        clientToken: flags["notify-client-token"],
      }
      : undefined,
    time: flags["time-url"] || process.env.CLAWJS_TIME_URL
      ? {
        baseUrl: flags["time-url"] || process.env.CLAWJS_TIME_URL || "",
        token: flags["time-token"] || process.env.CLAWJS_TIME_TOKEN,
      }
      : undefined,
  });
}

async function createCliWorkspaceClaw(
  runtimeAdapter: RuntimeAdapterId,
  flags: Record<string, string>,
  workspaceRoot: string,
  appId: string,
  workspaceId: string,
  agentId: string,
  _contextCwd: string,
) {
  return createWorkspaceClaw({
    runtime: {
      adapter: runtimeAdapter,
      agentDir: flags["agent-dir"],
      homeDir: flags["home-dir"],
      configPath: flags["config-path"],
      workspacePath: flags["runtime-workspace"],
      authStorePath: flags["auth-store"],
      gateway: {
        url: flags["gateway-url"],
        token: flags["gateway-token"],
        ...(flags["gateway-port"] ? { port: Number(flags["gateway-port"]) } : {}),
        configPath: flags["gateway-config"],
      },
    },
    workspace: {
      appId,
      workspaceId,
      agentId,
      rootDir: workspaceRoot,
    },
    templates: {
      pack: flags["template-pack"],
    },
    time: flags["time-url"] || process.env.CLAWJS_TIME_URL
      ? {
        baseUrl: flags["time-url"] || process.env.CLAWJS_TIME_URL || "",
        token: flags["time-token"] || process.env.CLAWJS_TIME_TOKEN,
      }
      : undefined,
  });
}

function resolveCliPackageVersion(): string | null {
  try {
    const packageJsonPath = fileURLToPath(new URL("../package.json", import.meta.url));
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as { version?: string };
    return packageJson.version ?? null;
  } catch {
    return null;
  }
}

function resolveDatabaseDirectory(flags: Record<string, string>, contextCwd: string): string {
  if (flags["database-dir"]) {
    return path.resolve(contextCwd, flags["database-dir"]);
  }
  if (process.env.CLAWJS_DATABASE_DIR?.trim()) {
    return path.resolve(process.env.CLAWJS_DATABASE_DIR);
  }
  return path.resolve(fileURLToPath(new URL("../../../database", import.meta.url)));
}

function resolveIotDirectory(flags: Record<string, string>, contextCwd: string): string {
  if (flags["iot-dir"]) {
    return path.resolve(contextCwd, flags["iot-dir"]);
  }
  if (process.env.CLAWJS_IOT_DIR?.trim()) {
    return path.resolve(process.env.CLAWJS_IOT_DIR);
  }
  return path.resolve(fileURLToPath(new URL("../../../iot", import.meta.url)));
}

function resolveErpDirectory(flags: Record<string, string>, contextCwd: string): string {
  if (flags["erp-dir"]) {
    return path.resolve(contextCwd, flags["erp-dir"]);
  }
  if (process.env.CLAWJS_ERP_DIR?.trim()) {
    return path.resolve(process.env.CLAWJS_ERP_DIR);
  }
  return path.resolve(fileURLToPath(new URL("../../../erp", import.meta.url)));
}

function resolveContentDirectory(flags: Record<string, string>, contextCwd: string): string {
  if (flags["content-dir"]) {
    return path.resolve(contextCwd, flags["content-dir"]);
  }
  if (process.env.CLAWJS_CONTENT_DIR?.trim()) {
    return path.resolve(process.env.CLAWJS_CONTENT_DIR);
  }
  return path.resolve(fileURLToPath(new URL("../../../content", import.meta.url)));
}

async function runDelegatedDatabaseCli(
  argv: string[],
  flags: Record<string, string>,
  context: CliContext,
): Promise<number> {
  const databaseDir = resolveDatabaseDirectory(flags, context.cwd);
  if (!fs.existsSync(path.join(databaseDir, "package.json"))) {
    context.stderr.write(`Database CLI not found at ${databaseDir}\n`);
    return CLI_EXIT_FAILURE;
  }

  const distCliPath = path.join(databaseDir, "dist", "cli.js");
  const command = fs.existsSync(distCliPath) ? process.execPath : "npm";
  const args = fs.existsSync(distCliPath)
    ? [distCliPath, ...argv.slice(1)]
    : ["--prefix", databaseDir, "run", "cli", "--silent", "--", ...argv.slice(1)];

  return await new Promise<number>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: context.cwd,
      stdio: "inherit",
      env: process.env,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      resolve(code ?? CLI_EXIT_FAILURE);
    });
  });
}

async function runDelegatedIotCli(
  argv: string[],
  flags: Record<string, string>,
  context: CliContext,
): Promise<number> {
  const iotDir = resolveIotDirectory(flags, context.cwd);
  if (!fs.existsSync(path.join(iotDir, "package.json"))) {
    context.stderr.write(`IoT CLI not found at ${iotDir}\n`);
    return CLI_EXIT_FAILURE;
  }

  const distCliPath = path.join(iotDir, "dist", "cli.js");
  const command = fs.existsSync(distCliPath) ? process.execPath : "npm";
  const args = fs.existsSync(distCliPath)
    ? [distCliPath, ...argv.slice(1)]
    : ["--prefix", iotDir, "run", "cli", "--silent", "--", ...argv.slice(1)];

  return await new Promise<number>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: context.cwd,
      stdio: "inherit",
      env: process.env,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      resolve(code ?? CLI_EXIT_FAILURE);
    });
  });
}

async function runDelegatedErpCli(
  argv: string[],
  flags: Record<string, string>,
  context: CliContext,
): Promise<number> {
  const erpDir = resolveErpDirectory(flags, context.cwd);
  if (!fs.existsSync(path.join(erpDir, "package.json"))) {
    context.stderr.write(`ERP CLI not found at ${erpDir}\n`);
    return CLI_EXIT_FAILURE;
  }

  const distCliPath = path.join(erpDir, "dist", "cli.js");
  const command = fs.existsSync(distCliPath) ? process.execPath : "npm";
  const args = fs.existsSync(distCliPath)
    ? [distCliPath, ...argv.slice(1)]
    : ["--prefix", erpDir, "run", "cli", "--silent", "--", ...argv.slice(1)];

  return await new Promise<number>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: context.cwd,
      stdio: "inherit",
      env: process.env,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      resolve(code ?? CLI_EXIT_FAILURE);
    });
  });
}

async function runDelegatedContentCli(
  argv: string[],
  flags: Record<string, string>,
  context: CliContext,
): Promise<number> {
  const contentDir = resolveContentDirectory(flags, context.cwd);
  if (!fs.existsSync(path.join(contentDir, "package.json"))) {
    context.stderr.write(`Content CLI not found at ${contentDir}\n`);
    return CLI_EXIT_FAILURE;
  }

  const distCliPath = path.join(contentDir, "dist", "cli.js");
  const command = fs.existsSync(distCliPath) ? process.execPath : "npm";
  const args = fs.existsSync(distCliPath)
    ? [distCliPath, ...argv.slice(1)]
    : ["--prefix", contentDir, "run", "cli", "--silent", "--", ...argv.slice(1)];

  return await new Promise<number>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: context.cwd,
      stdio: "inherit",
      env: process.env,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      resolve(code ?? CLI_EXIT_FAILURE);
    });
  });
}

function resolveRelayBaseUrl(flags: Record<string, string>): string {
  const raw = flags["relay-url"] ?? process.env.CLAWJS_RELAY_URL ?? process.env.RELAY_URL ?? "";
  if (!raw.trim()) {
    throw new Error("--relay-url is required");
  }
  const trimmed = raw.trim().replace(/\/$/, "");
  return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
}

function requireRelayBrowserConfig(flags: Record<string, string>): {
  baseUrl: string;
  accessToken: string;
  tenantId: string;
  agentId: string;
  workspaceId: string;
} {
  const accessToken = (flags["access-token"] ?? process.env.CLAWJS_RELAY_ACCESS_TOKEN ?? "").trim();
  const tenantId = (flags["tenant-id"] ?? process.env.CLAWJS_RELAY_TENANT_ID ?? "").trim();
  const agentId = (flags["agent-id"] ?? process.env.CLAWJS_RELAY_AGENT_ID ?? "").trim();
  const workspaceId = (flags["workspace-id"] ?? process.env.CLAWJS_RELAY_WORKSPACE_ID ?? "").trim();
  if (!accessToken) throw new Error("--access-token is required");
  if (!tenantId) throw new Error("--tenant-id is required");
  if (!agentId) throw new Error("--agent-id is required");
  if (!workspaceId) throw new Error("--workspace-id is required");
  return {
    baseUrl: resolveRelayBaseUrl(flags),
    accessToken,
    tenantId,
    agentId,
    workspaceId,
  };
}

async function relayBrowserRequest<T>(
  flags: Record<string, string>,
  input: {
    method: "GET" | "POST";
    path: string;
    body?: unknown;
  },
): Promise<T> {
  const { baseUrl, accessToken } = requireRelayBrowserConfig(flags);
  const response = await fetch(`${baseUrl}${input.path}`, {
    method: input.method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    ...(input.body !== undefined ? { body: JSON.stringify(input.body) } : {}),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `Relay browser request failed: ${response.status}`);
  }
  const text = await response.text();
  return (text ? JSON.parse(text) : null) as T;
}

function parsePackageManager(value: string | undefined): SupportedPackageManager {
  return value === "pnpm" ? "pnpm" : "npm";
}

function resolveTemplateName(type: ClawProjectType, value: string | undefined): string {
  if (value?.trim()) return value.trim();
  if (type === "app") return "next";
  return "node";
}

function resolveTemplateDirectory(type: ClawProjectType, templateName: string): string {
  const templateDir = path.join(CLI_TEMPLATE_ROOT, type);
  if (type === "app" && templateName !== "next") {
    throw new Error(`Unsupported template for ${type}: ${templateName}`);
  }
  if (type !== "app" && templateName !== "node") {
    throw new Error(`Unsupported template for ${type}: ${templateName}`);
  }
  if (!fs.existsSync(templateDir)) {
    throw new Error(`Missing CLI template for ${type}.`);
  }
  return templateDir;
}

function buildScaffoldNextSteps(type: ClawProjectType, packageManager: SupportedPackageManager): string[] {
  if (type === "agent") {
    return [
      `${packageManager} run claw:init`,
      `${packageManager} run agent:report`,
      `${packageManager} run agent:reply -- "Say hello"`,
    ];
  }
  if (type === "skill") {
    return [
      `${packageManager} test`,
      `${packageManager} run skill:check`,
    ];
  }
  if (type === "plugin") {
    return [
      `${packageManager} test`,
      `${packageManager} run plugin:check`,
    ];
  }
  if (type === "workspace") {
    return [
      `${packageManager} run claw:init`,
      `${packageManager} run claw:info`,
    ];
  }
  return [
    `${packageManager} run claw:init`,
    `${packageManager} run dev`,
  ];
}

function buildScaffoldCompletionNote(type: ClawProjectType): string {
  if (type === "workspace") {
    return "The generated workspace is intentionally minimal. Add capabilities over time with `claw generate` and `claw add`.";
  }
  if (type === "skill") {
    return "The generated package is intentionally narrow: one skill, one contract, one harness, ready to reuse across agents.";
  }
  if (type === "plugin") {
    return "The generated package is broader than a skill: it combines config, hooks, compatibility metadata, and bundled logic in one distributable plugin.";
  }
  return "The generated project uses the demo adapter by default. Switch scripts and helpers to openclaw when you want a real runtime.";
}

function resolveProjectRootOrThrow(startDir: string, explicitProject?: string): string {
  const root = explicitProject ? path.resolve(startDir, explicitProject) : locateProjectRoot(startDir);
  if (!root) {
    throw new Error("No Claw project found. Run `claw new ...` first or pass --project to a folder that contains claw.project.json.");
  }
  if (!readProjectConfig(root)) {
    throw new Error(`Missing or invalid claw.project.json at ${root}.`);
  }
  return root;
}

export async function runCli(argv: string[], context: CliContext): Promise<number> {
  const positionals = extractPositionals(argv);
  const [group, command, subcommand] = positionals;
  const wantsJson = argv.includes("--json");
  const flags = parseFlags(argv);
  const binName = context.binName?.trim() || DEFAULT_CLI_BIN;
  const usage = buildCliUsage(binName);

  if (argv.includes("--help") || argv.includes("-h") || group === "help") {
    context.stdout.write(`${usage}\n`);
    return CLI_EXIT_OK;
  }

  if (group === "database") {
    try {
      return await runDelegatedDatabaseCli(argv, flags, context);
    } catch (error) {
      context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return CLI_EXIT_FAILURE;
    }
  }

  if (group === "content") {
    try {
      return await runDelegatedContentCli(argv, flags, context);
    } catch (error) {
      context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return CLI_EXIT_FAILURE;
    }
  }

  if (group === "erp") {
    try {
      return await runDelegatedErpCli(argv, flags, context);
    } catch (error) {
      context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return CLI_EXIT_FAILURE;
    }
  }

  if (group === "iot") {
    try {
      return await runDelegatedIotCli(argv, flags, context);
    } catch (error) {
      context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return CLI_EXIT_FAILURE;
    }
  }

  if (group === "notify" && command === "send") {
    try {
      const claw = await createCliClaw(resolveRuntimeAdapterId(flags), flags, context.cwd, "notify-cli", "notify-cli", "notify-cli");
      const input = {
        ...(flags["idempotency-key"] ? { idempotencyKey: flags["idempotency-key"] } : {}),
        ...(flags.priority ? { priority: flags.priority as "passive" | "normal" | "time-sensitive" | "critical" } : {}),
        ...(parseJsonFlag<Record<string, unknown>>(flags["audience-json"], "--audience-json") ? { audience: parseJsonFlag<Record<string, unknown>>(flags["audience-json"], "--audience-json") } : {}),
        context: parseJsonFlag<Record<string, unknown>>(flags["context-json"], "--context-json")
          ?? {
            tenantId: flags["tenant-id"] ?? "",
            ...(flags["project-id"] ? { projectId: flags["project-id"] } : {}),
            ...(flags["agent-id"] ? { agentId: flags["agent-id"] } : {}),
            ...(flags["workspace-id"] ? { workspaceId: flags["workspace-id"] } : {}),
            ...(flags["event-type"] ? { eventType: flags["event-type"] } : {}),
            ...(flags.severity ? { severity: flags.severity } : {}),
          },
        delivery: parseJsonFlag<Record<string, unknown>>(flags["delivery-json"], "--delivery-json")
          ?? {
            ...(flags.mode ? { mode: flags.mode } : {}),
            ...(flags.title ? { title: flags.title } : {}),
            ...(flags.body ? { body: flags.body } : {}),
            ...(flags["target-client-app-id"] ? { targetClientAppId: flags["target-client-app-id"] } : {}),
          },
        ...(parseJsonFlag<Record<string, unknown>>(flags["receipt-policy-json"], "--receipt-policy-json")
          ? { receiptPolicy: parseJsonFlag<Record<string, unknown>>(flags["receipt-policy-json"], "--receipt-policy-json") }
          : {}),
      } as unknown as Parameters<typeof claw.notify.send>[0];
      const payload = await claw.notify.send(input);
      if (wantsJson) {
        writeJson(context.stdout, payload);
      } else {
        context.stdout.write(`${payload.notification.id}\n`);
      }
      return CLI_EXIT_OK;
    } catch (error) {
      context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return CLI_EXIT_FAILURE;
    }
  }

  if (group === "notify" && command === "cancel") {
    try {
      const notificationId = subcommand || flags["notification-id"];
      if (!notificationId) {
        context.stderr.write(`Usage: ${binName} notify cancel <notification-id> --notify-url URL --notify-source-token TOKEN\n`);
        return CLI_EXIT_USAGE;
      }
      const claw = await createCliClaw(resolveRuntimeAdapterId(flags), flags, context.cwd, "notify-cli", "notify-cli", "notify-cli");
      const payload = await claw.notify.cancel(notificationId);
      if (wantsJson) {
        writeJson(context.stdout, payload);
      } else {
        context.stdout.write(`${payload.notification.status}\n`);
      }
      return CLI_EXIT_OK;
    } catch (error) {
      context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return CLI_EXIT_FAILURE;
    }
  }

  if (group === "notify" && command === "subscriptions" && subcommand === "upsert") {
    try {
      const claw = await createCliClaw(resolveRuntimeAdapterId(flags), flags, context.cwd, "notify-cli", "notify-cli", "notify-cli");
      const payload = await claw.notify.subscriptions.upsert({
        ...(flags.id ? { id: flags.id } : {}),
        ...(flags["source-app-id"] ? { sourceAppId: flags["source-app-id"] } : {}),
        ...(flags["client-app-id"] ? { clientAppId: flags["client-app-id"] } : {}),
        ...(flags["project-id"] ? { projectId: flags["project-id"] } : {}),
        ...(flags["agent-id"] ? { agentId: flags["agent-id"] } : {}),
        ...(flags["workspace-id"] ? { workspaceId: flags["workspace-id"] } : {}),
        ...(flags["event-type"] ? { eventType: flags["event-type"] } : {}),
        ...(flags.severity ? { severity: flags.severity } : {}),
        ...(flags["min-priority"] ? { minPriority: flags["min-priority"] as "passive" | "normal" | "time-sensitive" | "critical" } : {}),
        ...(flags.action ? { action: flags.action as "allow" | "mute" } : {}),
        ...(readBooleanFlag(argv, flags, "installation-scoped", false) ? { installationScoped: true } : {}),
      });
      if (wantsJson) {
        writeJson(context.stdout, payload);
      } else {
        context.stdout.write(`${payload.subscription.id}\n`);
      }
      return CLI_EXIT_OK;
    } catch (error) {
      context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return CLI_EXIT_FAILURE;
    }
  }

  if (group === "notify" && command === "subscriptions" && subcommand === "delete") {
    try {
      const id = extractPositionals(argv)[3] || flags.id;
      if (!id) {
        context.stderr.write(`Usage: ${binName} notify subscriptions delete <id> --notify-url URL --notify-client-token TOKEN\n`);
        return CLI_EXIT_USAGE;
      }
      const claw = await createCliClaw(resolveRuntimeAdapterId(flags), flags, context.cwd, "notify-cli", "notify-cli", "notify-cli");
      const payload = await claw.notify.subscriptions.remove(id);
      if (wantsJson) {
        writeJson(context.stdout, payload);
      } else {
        context.stdout.write(`${payload.ok}\n`);
      }
      return CLI_EXIT_OK;
    } catch (error) {
      context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return CLI_EXIT_FAILURE;
    }
  }

  const workspaceRoot = flags.workspace || context.cwd;
  const appId = flags["app-id"] || "clawjs-app";
  const workspaceId = flags["workspace-id"] || pathSafeBasename(workspaceRoot);
  const agentId = flags["agent-id"] || workspaceId;
  const runtimeAdapterId = resolveRuntimeAdapterId(flags);
  const runtimeAdapter = getRuntimeAdapter(runtimeAdapterId);
  const mediaGroup = group === "image" || group === "audio" || group === "video" ? group : null;

  async function getTypedGenerationFacade(kind: MediaKind) {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    switch (kind) {
      case "image":
        return { claw, media: claw.image };
      case "audio":
        return { claw, media: claw.audio };
      case "video":
        return { claw, media: claw.video };
    }
  }

  if (group === "new") {
    const type = command as ClawProjectType | undefined;
    const projectName = subcommand;
    const supportedTypes: ClawProjectType[] = ["app", "agent", "server", "workspace", "skill", "plugin"];
    if (!type || !supportedTypes.includes(type) || !projectName) {
      context.stderr.write(`Usage: ${binName} new app|agent|server|workspace|skill|plugin <name> [--dir PATH] [--template NAME] [--package-manager npm|pnpm] [--git] [--install] [--yes]\n`);
      return CLI_EXIT_USAGE;
    }

    const templateName = resolveTemplateName(type, flags.template);
    const targetPath = path.resolve(context.cwd, flags.dir || projectName);
    const slug = createPackageName(projectName, `claw-${type}`);
    const title = createTitle(slug, `Claw ${createPascalCase(type, "Project")}`);
    const packageManager = flags["package-manager"] || flags.pm
      ? parsePackageManager(flags["package-manager"] || flags.pm)
      : detectPackageManager();
    const install = readBooleanFlag(argv, flags, "install", !argv.includes("--no-install") && !argv.includes("--skip-install"));
    const git = readBooleanFlag(argv, flags, "git", false);

    try {
      await scaffoldProject({
        context,
        targetPath,
        templateDir: resolveTemplateDirectory(type, templateName),
        replacements: {
          "__APP_NAME__": slug,
          "__APP_SLUG__": slug,
          "__APP_TITLE__": title,
          "__APP_PASCAL__": createPascalCase(slug, "ClawProject"),
        },
        packageManager,
        install,
        git,
        successLabel: `${type} ${slug}`,
        nextSteps: buildScaffoldNextSteps(type, packageManager),
        completionNote: buildScaffoldCompletionNote(type),
      });
      if (wantsJson) {
        writeJson(context.stdout, {
          ok: true,
          type,
          name: slug,
          targetPath,
          template: templateName,
          packageManager,
          install,
          git,
        });
      }
      return CLI_EXIT_OK;
    } catch (error) {
      context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return CLI_EXIT_FAILURE;
    }
  }

  if (group === "generate") {
    const resource = command as ClawResourceType | undefined;
    const resourceName = subcommand;
    const supportedResources: ClawResourceType[] = ["skill", "plugin", "provider", "channel", "command"];
    if (!resource || !supportedResources.includes(resource) || !resourceName) {
      context.stderr.write(`Usage: ${binName} generate skill|plugin|provider|channel|command <name> [--project PATH]\n`);
      return CLI_EXIT_USAGE;
    }

    try {
      const projectRoot = resolveProjectRootOrThrow(context.cwd, flags.project);
      const config = readProjectConfig(projectRoot);
      if (!config) {
        throw new Error(`Missing or invalid claw.project.json at ${projectRoot}.`);
      }
      const created = await generateProjectResource(projectRoot, config, resource, resourceName);
      if (wantsJson) {
        writeJson(context.stdout, {
          ok: true,
          projectRoot,
          resource,
          created,
        });
      } else {
        context.stdout.write(`generated ${resource} ${created.id} -> ${created.path}\n`);
      }
      return CLI_EXIT_OK;
    } catch (error) {
      context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return CLI_EXIT_FAILURE;
    }
  }

  if (group === "add") {
    const integration = command as ClawIntegrationType | undefined;
    const supportedIntegrations: ClawIntegrationType[] = ["provider", "channel", "telegram", "scheduler", "memory", "workspace"];
    if (!integration || !supportedIntegrations.includes(integration)) {
      context.stderr.write(`Usage: ${binName} add provider|channel|telegram|scheduler|memory|workspace [name] [--project PATH]\n`);
      return CLI_EXIT_USAGE;
    }

    try {
      const projectRoot = resolveProjectRootOrThrow(context.cwd, flags.project);
      const config = readProjectConfig(projectRoot);
      if (!config) {
        throw new Error(`Missing or invalid claw.project.json at ${projectRoot}.`);
      }
      const packageManager = flags["package-manager"] || flags.pm
        ? parsePackageManager(flags["package-manager"] || flags.pm)
        : detectPackageManager();
      const result = await addProjectIntegration(projectRoot, config, integration, {
        name: subcommand || flags.name,
        packageManager,
        runCommand: context.runCommand,
      });
      if (wantsJson) {
        writeJson(context.stdout, {
          ok: true,
          projectRoot,
          integration,
          ...result,
        });
      } else {
        context.stdout.write(`added ${integration} ${result.created.id} -> ${result.created.path}\n`);
      }
      return CLI_EXIT_OK;
    } catch (error) {
      context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return CLI_EXIT_FAILURE;
    }
  }

  if (group === "info") {
    try {
      const projectRoot = flags.project ? path.resolve(context.cwd, flags.project) : locateProjectRoot(context.cwd);
      const info: {
        projectRoot: string | null;
        project: unknown;
        packageJson: unknown;
        installedSdkVersion: string | null;
        workspace: unknown;
      } = projectRoot
        ? await collectProjectInfo(projectRoot) as {
          projectRoot: string | null;
          project: unknown;
          packageJson: unknown;
          installedSdkVersion: string | null;
          workspace: unknown;
        }
        : { projectRoot: null, project: null, packageJson: null, installedSdkVersion: null, workspace: null };
      const payload: {
        cli: { binName: string; package: string; version: string | null };
        projectRoot: string | null;
        project: unknown;
        packageJson: unknown;
        installedSdkVersion: string | null;
        workspace: unknown;
      } = {
        cli: {
          binName,
          package: "@clawjs/cli",
          version: resolveCliPackageVersion(),
        },
        ...info,
      };
      if (wantsJson) {
        writeJson(context.stdout, payload);
      } else {
        context.stdout.write(`cli: ${payload.cli.version ?? "unknown"}\n`);
        const project = (payload.project as { type?: string; name?: string; runtime?: { adapter?: string } } | null) ?? null;
        if (project) {
          context.stdout.write(`project: ${project.type ?? "unknown"} ${project.name ?? "unnamed"}\n`);
          context.stdout.write(`runtime: ${project.runtime?.adapter ?? "unknown"}\n`);
        } else {
          context.stdout.write("project: not detected\n");
        }
        const workspace = payload.workspace as { manifestPath?: string } | null;
        context.stdout.write(`workspace: ${workspace?.manifestPath ?? "not initialized"}\n`);
      }
      return CLI_EXIT_OK;
    } catch (error) {
      context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return CLI_EXIT_FAILURE;
    }
  }

  if (group === "runtime" && command === "status") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const status = await claw.runtime.status();
    if (wantsJson) {
      writeJson(context.stdout, status);
    } else {
      context.stdout.write(`runtime: ${status.runtimeName}\n`);
      context.stdout.write(`adapter: ${status.adapter}\n`);
      context.stdout.write(`cliAvailable: ${status.cliAvailable}\n`);
      context.stdout.write(`version: ${status.version ?? "unknown"}\n`);
    }
    return status.cliAvailable ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "runtime" && command === "install") {
    const installer = flags.installer === "pnpm" ? "pnpm" : "npm";
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const installCommand = claw.runtime.installCommand(installer);
    if (argv.includes("--dry-run")) {
      if (wantsJson) {
        writeJson(context.stdout, { ...installCommand, plan: claw.runtime.installPlan(installer), adapter: runtimeAdapterId });
      } else {
        context.stdout.write(`${installCommand.command} ${installCommand.args.join(" ")}\n`);
      }
      return CLI_EXIT_OK;
    }
    await claw.runtime.install(installer, (event) => {
      if (!wantsJson) writeProgress(context.stdout, event);
    });
    if (wantsJson) writeJson(context.stdout, { ok: true, adapter: runtimeAdapterId });
    return CLI_EXIT_OK;
  }

  if (group === "runtime" && command === "uninstall") {
    const installer = flags.installer === "pnpm" ? "pnpm" : "npm";
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const uninstallCommand = claw.runtime.uninstallCommand(installer);
    if (argv.includes("--dry-run")) {
      if (wantsJson) {
        writeJson(context.stdout, { ...uninstallCommand, plan: claw.runtime.uninstallPlan(installer), adapter: runtimeAdapterId });
      } else {
        context.stdout.write(`${uninstallCommand.command} ${uninstallCommand.args.join(" ")}\n`);
      }
      return CLI_EXIT_OK;
    }
    await claw.runtime.uninstall(installer, (event) => {
      if (!wantsJson) writeProgress(context.stdout, event);
    });
    if (wantsJson) writeJson(context.stdout, { ok: true, adapter: runtimeAdapterId });
    return CLI_EXIT_OK;
  }

  if (group === "runtime" && command === "repair") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    if (argv.includes("--dry-run")) {
      if (wantsJson) {
        writeJson(context.stdout, { ...claw.runtime.repairCommand(), plan: claw.runtime.repairPlan(), adapter: runtimeAdapterId });
      } else {
        const commandSpec = claw.runtime.repairCommand();
        context.stdout.write(`${commandSpec.command} ${commandSpec.args.join(" ")}\n`);
      }
      return CLI_EXIT_OK;
    }
    await claw.runtime.repair((event) => {
      if (!wantsJson) writeProgress(context.stdout, event);
    });
    if (wantsJson) writeJson(context.stdout, { ok: true, adapter: runtimeAdapterId });
    return CLI_EXIT_OK;
  }

  if (group === "runtime" && command === "setup-workspace") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const setupCommand = claw.runtime.setupWorkspaceCommand();
    if (argv.includes("--dry-run")) {
      if (wantsJson) {
        writeJson(context.stdout, { ...setupCommand, plan: claw.runtime.setupWorkspacePlan(), adapter: runtimeAdapterId });
      } else {
        context.stdout.write(`${setupCommand.command} ${setupCommand.args.join(" ")}\n`);
      }
      return CLI_EXIT_OK;
    }
    await claw.runtime.setupWorkspace((event) => {
      if (!wantsJson) writeProgress(context.stdout, event);
    });
    if (wantsJson) {
      writeJson(context.stdout, { ok: true, ...setupCommand, adapter: runtimeAdapterId });
    } else {
      context.stdout.write("ok\n");
    }
    return CLI_EXIT_OK;
  }

  if (group === "compat") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    if (argv.includes("--refresh")) {
      const snapshot = await claw.compat.refresh();
      const status = await claw.runtime.status();
      const compat = runtimeAdapter.buildCompatReport(status);
      if (wantsJson) {
        writeJson(context.stdout, { compat, snapshot, adapter: runtimeAdapterId });
      } else {
        context.stdout.write(`degraded: ${compat.degraded}\n`);
        context.stdout.write(`snapshot: ${snapshot.runtimeVersion ?? "unknown"}\n`);
      }
      return compat.degraded ? CLI_EXIT_DEGRADED : CLI_EXIT_OK;
    }
    const status = await claw.runtime.status();
    const compat = runtimeAdapter.buildCompatReport(status);
    if (wantsJson) {
      writeJson(context.stdout, { compat, snapshot: claw.compat.read(), adapter: runtimeAdapterId });
    } else {
      context.stdout.write(`degraded: ${compat.degraded}\n`);
      if (compat.issues.length > 0) {
        context.stdout.write(`${compat.issues.join("\n")}\n`);
      }
    }
    return compat.degraded ? CLI_EXIT_DEGRADED : CLI_EXIT_OK;
  }

  if (group === "browser" && (command === "status" || command === "ensure" || command === "share")) {
    try {
      const relay = requireRelayBrowserConfig(flags);
      const browserPath = `/tenants/${relay.tenantId}/agents/${relay.agentId}/workspaces/${relay.workspaceId}/browser/session`;
      const payload = command === "status"
        ? await relayBrowserRequest<{
            session: Record<string, unknown>;
            sharePath: string;
            shareUrl: string;
          }>(flags, {
            method: "GET",
            path: browserPath,
          })
        : await relayBrowserRequest<{
            session: Record<string, unknown>;
            sharePath: string;
            shareUrl: string;
          }>(flags, {
            method: "POST",
            path: browserPath,
            ...(flags.url?.trim() ? { body: { initialUrl: flags.url.trim() } } : {}),
          });
      if (wantsJson) {
        writeJson(context.stdout, payload);
      } else if (command === "share") {
        context.stdout.write(`${payload.shareUrl}\n`);
      } else if (command === "status") {
        context.stdout.write(`${String((payload.session as { status?: string })?.status ?? "unknown")}\n`);
      } else {
        context.stdout.write(`${payload.shareUrl}\n`);
      }
      return CLI_EXIT_OK;
    } catch (error) {
      context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return CLI_EXIT_FAILURE;
    }
  }

  if (group === "doctor") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const doctor = await claw.doctor.run();
    const projectRoot = locateProjectRoot(context.cwd);
    const project = projectRoot ? readProjectConfig(projectRoot) : null;
    const payload = {
      ...doctor,
      cli: {
        package: "@clawjs/cli",
        version: resolveCliPackageVersion(),
        binName,
        projectRoot,
        projectType: project?.type ?? null,
      },
    };
    if (wantsJson) {
      writeJson(context.stdout, payload);
    } else {
      context.stdout.write(`ok: ${doctor.ok}\n`);
      if (project) {
        context.stdout.write(`project: ${project.type} ${project.name}\n`);
      }
      if (doctor.issues.length > 0) {
        context.stdout.write(`${doctor.issues.map((issue) => issue.message).join("\n")}\n`);
      }
    }
    return doctor.ok ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "workspace" && command === "init") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    await claw.workspace.init();
    const inspected = await claw.workspace.inspect();
    if (wantsJson) {
      writeJson(context.stdout, {
        manifestPath: inspected.manifestPath,
        runtimeAdapter: runtimeAdapterId,
        canonicalPaths: claw.workspace.canonicalPaths(),
      });
    } else {
      context.stdout.write(`${inspected.manifestPath}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "workspace" && command === "attach") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const manifest = await claw.workspace.attach();
    if (wantsJson) {
      writeJson(context.stdout, manifest);
    } else {
      context.stdout.write(`${manifest?.workspaceId ?? "missing"}\n`);
    }
    return manifest ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
  }

  if (group === "workspace" && command === "inspect") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const inspected = await claw.workspace.inspect();
    if (wantsJson) {
      writeJson(context.stdout, inspected);
    } else {
      context.stdout.write(`manifest: ${inspected.manifest ? "present" : "missing"}\n`);
      context.stdout.write(`compatSnapshot: ${inspected.compatSnapshot ? "present" : "missing"}\n`);
    }
    return inspected.manifest ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
  }

  if (group === "workspace" && command === "discover") {
    const roots = flags.root ? [flags.root] : [workspaceRoot];
    const discovered = discoverWorkspaces({
      roots,
      ...(flags["max-depth"] ? { maxDepth: Number(flags["max-depth"]) } : {}),
    });
    if (wantsJson) {
      writeJson(context.stdout, discovered);
    } else {
      context.stdout.write(`${discovered.map((entry) => entry.rootDir).join("\n")}\n`);
    }
    return discovered.length > 0 ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
  }

  if (group === "workspace" && command === "validate") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const validation = await claw.workspace.validate();
    if (wantsJson) {
      writeJson(context.stdout, validation);
    } else {
      context.stdout.write(`ok: ${validation.ok}\n`);
      if (validation.missingFiles.length > 0) {
        context.stdout.write(`missingFiles: ${validation.missingFiles.join(", ")}\n`);
      }
    }
    return validation.ok ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "workspace" && command === "reset") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const resetOptions = {
      removeManifest: readBooleanFlag(argv, flags, "remove-manifest", true),
      removeCompat: readBooleanFlag(argv, flags, "remove-compat", true),
      removeProjections: readBooleanFlag(argv, flags, "remove-projections", readBooleanFlag(argv, flags, "remove-bindings", true)),
      removeObserved: readBooleanFlag(argv, flags, "remove-observed", readBooleanFlag(argv, flags, "remove-state", true)),
      removeIntents: readBooleanFlag(argv, flags, "remove-intents", true),
      removeSessions: readBooleanFlag(argv, flags, "remove-sessions", true),
      removeAudit: readBooleanFlag(argv, flags, "remove-audit", true),
      removeBackups: readBooleanFlag(argv, flags, "remove-backups", false),
      removeLocks: readBooleanFlag(argv, flags, "remove-locks", false),
      removeRuntimeFiles: readBooleanFlag(argv, flags, "remove-runtime-files", false),
    };
    if (argv.includes("--dry-run")) {
      const plan = await claw.workspace.previewReset(resetOptions);
      if (wantsJson) {
        writeJson(context.stdout, plan);
      } else {
        context.stdout.write(`${plan.targets.map((target) => `${target.exists ? "remove" : "skip"} ${target.path}`).join("\n")}\n`);
      }
      return CLI_EXIT_OK;
    }
    const result = await claw.workspace.reset(resetOptions);
    if (wantsJson) {
      writeJson(context.stdout, result);
    } else {
      context.stdout.write(`removed=${result.removedPaths.length} preserved=${result.preservedPaths.length}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "workspace" && command === "repair") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const repaired = await claw.workspace.repair();
    if (wantsJson) {
      writeJson(context.stdout, repaired);
    } else {
      context.stdout.write(`createdDirectories=${repaired.createdDirectories.length} createdRuntimeFiles=${repaired.createdRuntimeFiles.length}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "models" && command === "list") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const models = await claw.models.list();
    if (wantsJson) {
      writeJson(context.stdout, models);
    } else {
      context.stdout.write(`${models.map((model) => `${model.isDefault ? "*" : "-"} ${model.id}`).join("\n")}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "models" && command === "default") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const model = await claw.models.getDefault();
    if (wantsJson) {
      writeJson(context.stdout, model);
    } else {
      context.stdout.write(`${model?.modelId ?? "none"}\n`);
    }
    return model ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
  }

  if (group === "models" && command === "set-default") {
    const target = flags.model;
    if (!target) {
      context.stderr.write("--model is required\n");
      return CLI_EXIT_USAGE;
    }
    if (argv.includes("--dry-run")) {
      if (runtimeAdapterId !== "openclaw") {
        const commandSpec = runtimeAdapterId === "zeroclaw"
          ? { command: "write-config", args: [`default_model=${target}`] }
          : { command: "picoclaw", args: ["model", target] };
        if (wantsJson) {
          writeJson(context.stdout, { ...commandSpec, modelId: target, adapter: runtimeAdapterId });
        } else {
          context.stdout.write(`${commandSpec.command} ${commandSpec.args.join(" ")}\n`);
        }
        return CLI_EXIT_OK;
      }
      const commandSpec = buildSetDefaultModelCommand(target, agentId);
      if (wantsJson) {
        writeJson(context.stdout, {
          command: "openclaw",
          args: commandSpec.args,
          modelId: commandSpec.modelId,
          adapter: runtimeAdapterId,
        });
      } else {
        context.stdout.write(`openclaw ${commandSpec.args.join(" ")}\n`);
      }
      return CLI_EXIT_OK;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const modelId = await claw.models.setDefault(target);
    if (wantsJson) {
      writeJson(context.stdout, { modelId, adapter: runtimeAdapterId });
    } else {
      context.stdout.write(`${modelId}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "providers" && command === "list") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const providers = await claw.providers.list();
    if (wantsJson) {
      writeJson(context.stdout, providers);
    } else {
      context.stdout.write(`${providers.map((provider) => `${provider.id}:${provider.local ? "local" : "remote"}`).join("\n")}\n`);
    }
    return providers.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "providers" && command === "catalog") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const catalog = await claw.providers.catalog();
    if (wantsJson) {
      writeJson(context.stdout, catalog);
    } else {
      context.stdout.write(`${catalog.providers.map((provider) => provider.id).join("\n")}\n`);
    }
    return catalog.providers.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "providers" && command === "auth-state") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const state = await claw.providers.authState();
    if (wantsJson) {
      writeJson(context.stdout, state);
    } else {
      context.stdout.write(`${Object.entries(state.providers).map(([provider, summary]) => `${provider}:${summary.hasAuth ? "ready" : "missing"}`).join("\n")}\n`);
    }
    return Object.keys(state.providers).length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "secrets" && command === "list") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const secrets = await claw.secrets.list(flags.search);
    if (wantsJson) {
      writeJson(context.stdout, secrets);
    } else {
      context.stdout.write(`${secrets.map((secret) => `${secret.name}${secret.typeId ? ` [${secret.typeId}]` : ""}`).join("\n")}\n`);
    }
    return secrets.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "secrets" && command === "describe") {
    const name = flags.name || flags.id;
    if (!name) {
      context.stderr.write("--name is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const secret = await claw.secrets.describe(name);
    if (wantsJson) {
      writeJson(context.stdout, secret);
    } else {
      context.stdout.write(`${secret ? `${secret.name}${secret.typeId ? ` [${secret.typeId}]` : ""}` : "missing"}\n`);
    }
    return secret ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
  }

  if (group === "secrets" && command === "types") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const types = await claw.secrets.types(flags.search);
    if (wantsJson) {
      writeJson(context.stdout, types);
    } else {
      context.stdout.write(`${types.map((type) => `${type.typeId} ${type.label}`).join("\n")}\n`);
    }
    return types.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "secrets" && command === "capabilities") {
    const name = flags.name || flags.id;
    if (!name) {
      context.stderr.write("--name is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const payload = await claw.secrets.capabilities(name);
    if (wantsJson) {
      writeJson(context.stdout, payload);
    } else {
      context.stdout.write(`${payload.capabilities.map((entry) => `${entry.capability}:${entry.allowed ? "allow" : "deny"}`).join("\n")}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "secrets" && command === "broker" && subcommand === "http") {
    const url = flags.url;
    if (!url) {
      context.stderr.write("--url is required\n");
      return CLI_EXIT_USAGE;
    }
    const method = flags.method || "GET";
    const headers = parseJsonFlag<Record<string, string>>(flags["headers-json"], "--headers-json");
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const payload = await claw.secrets.brokerHttp({
      method,
      url,
      ...(headers ? { headers } : {}),
      ...(flags.body ? { body: flags.body } : {}),
    });
    if (wantsJson) {
      writeJson(context.stdout, payload);
    } else {
      context.stdout.write(`${payload.status}\n${payload.bodyText}\n`);
    }
    return payload.ok ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
  }

  if (group === "secrets" && command === "leases" && subcommand === "list") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const leases = await claw.secrets.leases();
    if (wantsJson) {
      writeJson(context.stdout, leases);
    } else {
      context.stdout.write(`${leases.map((lease) => `${lease.secretName} ${lease.mode} ${lease.revokedAt ? "revoked" : lease.consumedAt ? "consumed" : "active"}`).join("\n")}\n`);
    }
    return leases.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "auth" && command === "status") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const auth = await claw.auth.status();
    if (wantsJson) {
      writeJson(context.stdout, auth);
    } else {
      context.stdout.write(`${Object.values(auth).map((summary) => `${summary.provider}:${summary.authType ?? "none"}`).join("\n")}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "auth" && command === "login") {
    const provider = flags.provider;
    if (!provider) {
      context.stderr.write("--provider is required\n");
      return CLI_EXIT_USAGE;
    }
    if (argv.includes("--dry-run")) {
      const launched = await runtimeAdapter.login(provider, {
        spawnDetachedPty(command, args) {
          return { pid: undefined, command, args };
        },
      }, {
        adapter: runtimeAdapterId,
        agentId,
        agentDir: flags["agent-dir"],
        cwd: workspaceRoot,
        setDefault: flags["set-default"] !== "false",
      } as never);
      if (wantsJson) {
        writeJson(context.stdout, launched);
      } else {
        context.stdout.write(`${launched.command ?? ""} ${(launched.args ?? []).join(" ")}\n`);
      }
      return CLI_EXIT_OK;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const launched = await claw.auth.login(provider, {
      setDefault: flags["set-default"] !== "false",
    });
    if (wantsJson) {
      writeJson(context.stdout, launched);
    } else {
      context.stdout.write(
        launched.status === "reused"
          ? `${launched.provider} reused\n`
          : `${launched.provider} ${launched.pid ?? "unknown"}\n`,
      );
    }
    return CLI_EXIT_OK;
  }

  if (group === "auth" && command === "remove") {
    const provider = flags.provider;
    if (!provider) {
      context.stderr.write("--provider is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const removed = claw.auth.removeProvider(provider);
    if (wantsJson) {
      writeJson(context.stdout, { removed });
    } else {
      context.stdout.write(`${removed}\n`);
    }
    return removed > 0 ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
  }

  if (group === "scheduler" && command === "list") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const schedulers = await claw.scheduler.list();
    if (wantsJson) {
      writeJson(context.stdout, schedulers);
    } else {
      context.stdout.write(`${schedulers.map((entry) => `${entry.enabled ? "*" : "-"} ${entry.id}`).join("\n")}\n`);
    }
    return schedulers.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "scheduler" && (command === "run" || command === "enable" || command === "disable")) {
    const id = flags.id;
    if (!id) {
      context.stderr.write("--id is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    if (command === "run") await claw.scheduler.run(id);
    if (command === "enable") await claw.scheduler.enable(id);
    if (command === "disable") await claw.scheduler.disable(id);
    if (wantsJson) {
      writeJson(context.stdout, { ok: true, id, command });
    } else {
      context.stdout.write("ok\n");
    }
    return CLI_EXIT_OK;
  }

  if (group === "time") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    if (command === "list") {
      const payload = await claw.time.list({
        kind: flags.kind as TemporalItem["kind"] | undefined,
        status: flags.status as TemporalItem["status"] | undefined,
        workspaceId: flags["workspace-id"] || workspaceId,
        ...(flags["project-id"] ? { projectId: flags["project-id"] } : {}),
        ...(flags["agent-id"] ? { agentId: flags["agent-id"] } : {}),
        ...(flags["owner-id"] ? { ownerId: flags["owner-id"] } : {}),
        ...(flags["source-provider"] ? { sourceProvider: flags["source-provider"] } : {}),
      });
      if (wantsJson) writeJson(context.stdout, payload);
      else context.stdout.write(`${payload.items.map((item) => `${item.id} ${item.kind} ${item.status} ${item.title}`).join("\n")}\n`);
      return payload.items.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
    if (command === "get") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw time get <id>\n");
        return CLI_EXIT_USAGE;
      }
      const payload = await claw.time.get(id);
      if (wantsJson) writeJson(context.stdout, payload);
      else context.stdout.write(`${payload.item.id} ${payload.item.title}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "create") {
      const kind = (subcommand || flags.kind) as "event" | "routine" | "reminder" | "deadline" | "follow_up" | undefined;
      const title = extractPositionals(argv)[3] || flags.title;
      if (!kind || !title) {
        context.stderr.write("Usage: claw time create <kind> <title> [--starts-at ISO|--cron EXPR|--rrule RRULE|--after 24h --anchor-type thread --anchor-id ID --anchor-at ISO]\n");
        return CLI_EXIT_USAGE;
      }
      const payload = await claw.time.create({
        kind,
        title,
        description: flags.description,
        location: flags.location,
        startsAt: flags["starts-at"],
        endsAt: flags["ends-at"],
        workspaceId,
        ...(flags["project-id"] ? { projectId: flags["project-id"] } : {}),
        ...(flags["agent-id"] ? { agentId: flags["agent-id"] } : {}),
        ...(flags.timezone ? { timezone: flags.timezone } : {}),
        ...(flags.cron || flags.rrule || flags["after"]
          ? {
              schedule: {
                mode: flags["after"] ? "relative" : flags.rrule ? "rrule" : flags.cron ? "cron" : "one_off",
                timezone: flags.timezone || "UTC",
                ...(flags.cron ? { cron: flags.cron } : {}),
                ...(flags.rrule ? { rrule: flags.rrule } : {}),
                ...(flags["after"]
                  ? {
                      relative: {
                        anchorType: (flags["anchor-type"] || "thread") as NonNullable<TemporalItem["anchorType"]>,
                        anchorId: flags["anchor-id"] || "",
                        anchorAt: flags["anchor-at"] || new Date().toISOString(),
                        offsetMs: Number(flags["after-ms"] || 0),
                        ...(flags["cancel-on"] ? { cancelOn: flags["cancel-on"] as "reply_received" | "task_completed" | "event_started" | "execution_succeeded" } : {}),
                      },
                    }
                  : {}),
              },
            }
          : {}),
      });
      if (wantsJson) writeJson(context.stdout, payload);
      else context.stdout.write(`${payload.item.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "update") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw time update <id> [--title TEXT] [--status STATUS]\n");
        return CLI_EXIT_USAGE;
      }
      const payload = await claw.time.update(id, {
        title: flags.title,
        description: flags.description,
        status: flags.status as "active" | "paused" | "cancelled" | "completed" | undefined,
        location: flags.location,
        startsAt: flags["starts-at"],
        endsAt: flags["ends-at"],
        ...(flags.timezone ? { timezone: flags.timezone } : {}),
      });
      if (wantsJson) writeJson(context.stdout, payload);
      else context.stdout.write(`${payload.item.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "delete") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw time delete <id>\n");
        return CLI_EXIT_USAGE;
      }
      const payload = await claw.time.delete(id);
      if (wantsJson) writeJson(context.stdout, payload);
      else context.stdout.write(`${payload.ok}\n`);
      return payload.ok ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
    }
    if (command === "pause" || command === "resume" || command === "run") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write(`Usage: claw time ${command} <id>\n`);
        return CLI_EXIT_USAGE;
      }
      const payload = command === "pause"
        ? await claw.time.pause(id)
        : command === "resume"
          ? await claw.time.resume(id)
          : await claw.time.runNow(id);
      if (wantsJson) writeJson(context.stdout, payload);
      else context.stdout.write(`${"item" in payload ? payload.item.id : "ok"}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "executions") {
      const payload = await claw.time.listExecutions(flags["item-id"]);
      if (wantsJson) writeJson(context.stdout, payload);
      else context.stdout.write(`${payload.executions.map((entry) => `${entry.itemId} ${entry.status} ${entry.scheduledFor}`).join("\n")}\n`);
      return payload.executions.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
    if (command === "calendar") {
      const payload = await claw.time.calendarView({ start: flags.start, end: flags.end });
      if (wantsJson) writeJson(context.stdout, payload);
      else context.stdout.write(`${payload.items.map((item) => `${item.title} ${item.startsAt || item.nextRunAt}`).join("\n")}\n`);
      return payload.items.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
    if (command === "timeline") {
      const payload = await claw.time.timelineView({ start: flags.start, end: flags.end });
      if (wantsJson) writeJson(context.stdout, payload);
      else context.stdout.write(`${payload.items.map((item) => `${item.title} ${item.startsAt || item.nextRunAt}`).join("\n")}\n`);
      return payload.items.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
  }

  if (group === "schedule" && (command === "at" || command === "every" || command === "after")) {
    const expression = subcommand;
    const title = extractPositionals(argv)[3] || flags.title;
    if (!expression || !title) {
      context.stderr.write("Usage: claw schedule at|every|after <expression> <title> [--anchor-type TYPE --anchor-id ID --anchor-at ISO]\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const payload = await claw.time.create({
      kind: command === "at" ? "event" : command === "every" ? "routine" : "follow_up",
      title,
      description: flags.description,
      workspaceId,
      ...(flags["project-id"] ? { projectId: flags["project-id"] } : {}),
      ...(flags["agent-id"] ? { agentId: flags["agent-id"] } : {}),
      natural: {
        command,
        expression,
        timezone: flags.timezone,
        anchorType: flags["anchor-type"] as NonNullable<TemporalItem["anchorType"]> | undefined,
        anchorId: flags["anchor-id"],
        anchorAt: flags["anchor-at"],
      },
    });
    if (wantsJson) writeJson(context.stdout, payload);
    else context.stdout.write(`${payload.item.id}\n`);
    return CLI_EXIT_OK;
  }

  if (group === "memory" && (command === "list" || command === "status" || command === "inspect")) {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const memory = await claw.memory.list();
    if (wantsJson) {
      writeJson(context.stdout, memory);
    } else {
      context.stdout.write(`${memory.map((entry) => `${entry.id} ${entry.label}`).join("\n")}\n`);
    }
    return memory.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "memory" && command === "search") {
    const query = flags.query;
    if (!query) {
      context.stderr.write("--query is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const results = await claw.memory.search(query);
    if (wantsJson) {
      writeJson(context.stdout, results);
    } else {
      context.stdout.write(`${results.map((entry) => `${entry.id} ${entry.label}`).join("\n")}\n`);
    }
    return results.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "tasks") {
    const claw = await createCliWorkspaceClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, context.cwd);
    if (command === "list") {
      const tasks = await claw.tasks.list({
        ...(flags.status ? { status: parseCsvFlag(flags.status) as Array<"todo" | "in_progress" | "blocked" | "done" | "cancelled"> } : {}),
        ...(flags.assignee ? { assigneePersonId: flags.assignee } : {}),
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
        includeArchived: readBooleanFlag(argv, flags, "include-archived", false),
      });
      if (wantsJson) writeJson(context.stdout, tasks);
      else context.stdout.write(`${tasks.map((task) => `${task.status} ${task.id} ${task.title}`).join("\n")}\n`);
      return tasks.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
    if (command === "get") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw tasks get <id> [--json]\n");
        return CLI_EXIT_USAGE;
      }
      const task = await claw.tasks.get(id);
      if (!task) return CLI_EXIT_FAILURE;
      if (wantsJson) writeJson(context.stdout, task);
      else context.stdout.write(`${task.status} ${task.id} ${task.title}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "create") {
      const title = subcommand || flags.title;
      if (!title) {
        context.stderr.write("Usage: claw tasks create <title> [--description TEXT] [--status STATUS] [--priority PRIORITY] [--labels a,b]\n");
        return CLI_EXIT_USAGE;
      }
      const task = await claw.tasks.create({
        title,
        description: flags.description,
        status: flags.status as "todo" | "in_progress" | "blocked" | "done" | "cancelled" | undefined,
        priority: flags.priority as "low" | "medium" | "high" | "urgent" | undefined,
        labels: parseCsvFlag(flags.labels),
        assigneePersonId: flags.assignee,
        watcherPersonIds: parseCsvFlag(flags.watchers),
        dueAt: flags["due-at"],
        eventId: flags["event-id"],
        projectId: flags["project-id"],
        goalId: flags["goal-id"],
        dependsOnTaskIds: parseCsvFlag(flags["depends-on"]),
        companyId: flags["company-id"],
        portfolioId: flags["portfolio-id"],
        portfolioItemId: flags["portfolio-item-id"],
      });
      if (wantsJson) writeJson(context.stdout, task);
      else context.stdout.write(`${task.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "update") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw tasks update <id> [--title TEXT] [--description TEXT] [--status STATUS]\n");
        return CLI_EXIT_USAGE;
      }
      const task = await claw.tasks.update(id, {
        title: flags.title,
        description: flags.description,
        status: flags.status as "todo" | "in_progress" | "blocked" | "done" | "cancelled" | undefined,
        priority: flags.priority as "low" | "medium" | "high" | "urgent" | undefined,
        ...(flags.labels ? { labels: parseCsvFlag(flags.labels) } : {}),
        assigneePersonId: flags.assignee,
        ...(flags.watchers ? { watcherPersonIds: parseCsvFlag(flags.watchers) } : {}),
        dueAt: flags["due-at"],
        eventId: flags["event-id"],
        projectId: flags["project-id"],
        goalId: flags["goal-id"],
        ...(flags["depends-on"] ? { dependsOnTaskIds: parseCsvFlag(flags["depends-on"]) } : {}),
        companyId: flags["company-id"],
        portfolioId: flags["portfolio-id"],
        portfolioItemId: flags["portfolio-item-id"],
      });
      if (wantsJson) writeJson(context.stdout, task);
      else context.stdout.write(`${task.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "complete") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw tasks complete <id>\n");
        return CLI_EXIT_USAGE;
      }
      const task = await claw.tasks.complete(id);
      if (wantsJson) writeJson(context.stdout, task);
      else context.stdout.write(`${task.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "search") {
      const query = subcommand || flags.query;
      if (!query) {
        context.stderr.write("Usage: claw tasks search <query> [--strategy auto|keyword|semantic|hybrid]\n");
        return CLI_EXIT_USAGE;
      }
      const results = await claw.tasks.search(query, {
        strategy: flags.strategy as "auto" | "keyword" | "semantic" | "hybrid" | undefined,
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, results);
      else context.stdout.write(`${results.map((result) => `${result.score.toFixed(1)} ${result.id} ${result.title}`).join("\n")}\n`);
      return results.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
  }

  if (group === "goals") {
    const claw = await createCliWorkspaceClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, context.cwd);
    if (command === "list") {
      const goals = await claw.goals.list({
        ...(flags.status ? { status: parseCsvFlag(flags.status) as Array<"active" | "paused" | "done"> } : {}),
        ...(flags["project-id"] ? { projectId: flags["project-id"] } : {}),
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
        includeArchived: readBooleanFlag(argv, flags, "include-archived", false),
      });
      if (wantsJson) writeJson(context.stdout, goals);
      else context.stdout.write(`${goals.map((goal) => `${goal.status} ${goal.id} ${goal.title}`).join("\n")}\n`);
      return goals.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
    if (command === "get") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw goals get <id> [--json]\n");
        return CLI_EXIT_USAGE;
      }
      const goal = await claw.goals.get(id);
      if (!goal) return CLI_EXIT_FAILURE;
      if (wantsJson) writeJson(context.stdout, goal);
      else context.stdout.write(`${goal.status} ${goal.id} ${goal.title}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "create") {
      const title = subcommand || flags.title;
      if (!title) {
        context.stderr.write("Usage: claw goals create <title> [--status STATUS] [--project-id ID]\n");
        return CLI_EXIT_USAGE;
      }
      const goal = await claw.goals.create({
        title,
        description: flags.description,
        status: flags.status as "active" | "paused" | "done" | undefined,
        level: flags.level as "company" | "team" | "personal" | undefined,
        projectId: flags["project-id"],
        parentId: flags["parent-id"],
        parentGoalId: flags["parent-goal-id"],
        ownerPersonId: flags["owner-person-id"],
        ownerAgentId: flags["owner-agent-id"],
        companyId: flags["company-id"],
        portfolioId: flags["portfolio-id"],
        portfolioItemId: flags["portfolio-item-id"],
        metricKey: flags["metric-key"],
        metricLabel: flags["metric-label"],
        ...(flags["target-value"] ? { targetValue: Number(flags["target-value"]) } : {}),
        ...(flags["current-value"] ? { currentValue: Number(flags["current-value"]) } : {}),
        unit: flags.unit,
        period: flags.period,
        healthStatus: flags["health-status"] as "green" | "yellow" | "red" | "unknown" | undefined,
      });
      if (wantsJson) writeJson(context.stdout, goal);
      else context.stdout.write(`${goal.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "update") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw goals update <id> [--title TEXT] [--status STATUS]\n");
        return CLI_EXIT_USAGE;
      }
      const goal = await claw.goals.update(id, {
        title: flags.title,
        description: flags.description,
        status: flags.status as "active" | "paused" | "done" | undefined,
        level: flags.level as "company" | "team" | "personal" | undefined,
        projectId: flags["project-id"],
        parentId: flags["parent-id"],
        parentGoalId: flags["parent-goal-id"],
        ownerPersonId: flags["owner-person-id"],
        ownerAgentId: flags["owner-agent-id"],
        companyId: flags["company-id"],
        portfolioId: flags["portfolio-id"],
        portfolioItemId: flags["portfolio-item-id"],
        metricKey: flags["metric-key"],
        metricLabel: flags["metric-label"],
        ...(flags["target-value"] ? { targetValue: Number(flags["target-value"]) } : {}),
        ...(flags["current-value"] ? { currentValue: Number(flags["current-value"]) } : {}),
        unit: flags.unit,
        period: flags.period,
        healthStatus: flags["health-status"] as "green" | "yellow" | "red" | "unknown" | undefined,
      });
      if (wantsJson) writeJson(context.stdout, goal);
      else context.stdout.write(`${goal.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "delete") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw goals delete <id>\n");
        return CLI_EXIT_USAGE;
      }
      const removed = await claw.goals.remove(id);
      if (!removed) return CLI_EXIT_FAILURE;
      if (wantsJson) writeJson(context.stdout, { ok: true });
      else context.stdout.write("ok\n");
      return CLI_EXIT_OK;
    }
    if (command === "search") {
      const query = subcommand || flags.query;
      if (!query) {
        context.stderr.write("Usage: claw goals search <query>\n");
        return CLI_EXIT_USAGE;
      }
      const results = await claw.goals.search(query, {
        strategy: flags.strategy as "auto" | "keyword" | "semantic" | "hybrid" | undefined,
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, results);
      else context.stdout.write(`${results.map((result) => `${result.score.toFixed(1)} ${result.id} ${result.title}`).join("\n")}\n`);
      return results.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
  }

  if (group === "projects") {
    const claw = await createCliWorkspaceClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, context.cwd);
    if (command === "list") {
      const projects = await claw.projects.list({
        ...(flags.status ? { status: parseCsvFlag(flags.status) as Array<"draft" | "in_progress" | "paused" | "done" | "archived"> } : {}),
        ...(flags["goal-id"] ? { goalId: flags["goal-id"] } : {}),
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
        includeArchived: readBooleanFlag(argv, flags, "include-archived", false),
      });
      if (wantsJson) writeJson(context.stdout, projects);
      else context.stdout.write(`${projects.map((project) => `${project.status} ${project.id} ${project.name}`).join("\n")}\n`);
      return projects.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
    if (command === "get") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw projects get <id> [--json]\n");
        return CLI_EXIT_USAGE;
      }
      const project = await claw.projects.get(id);
      if (!project) return CLI_EXIT_FAILURE;
      if (wantsJson) writeJson(context.stdout, project);
      else context.stdout.write(`${project.status} ${project.id} ${project.name}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "create") {
      const name = subcommand || flags.name || flags.title;
      if (!name) {
        context.stderr.write("Usage: claw projects create <name> [--status STATUS] [--goal-id ID]\n");
        return CLI_EXIT_USAGE;
      }
      const project = await claw.projects.create({
        name,
        description: flags.description,
        status: flags.status as "draft" | "in_progress" | "paused" | "done" | "archived" | undefined,
        goalId: flags["goal-id"],
        ownerPersonId: flags["owner-person-id"],
        leadAgentId: flags["lead-agent-id"],
        companyId: flags["company-id"],
        portfolioId: flags["portfolio-id"],
        portfolioItemId: flags["portfolio-item-id"],
        color: flags.color,
        kind: flags.kind as "delivery" | "growth" | "ops" | "research" | "migration" | "other" | undefined,
        healthStatus: flags["health-status"] as "green" | "yellow" | "red" | "unknown" | undefined,
        startDate: flags["start-date"],
        targetDate: flags["target-date"],
      });
      if (wantsJson) writeJson(context.stdout, project);
      else context.stdout.write(`${project.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "update") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw projects update <id> [--name TEXT] [--status STATUS]\n");
        return CLI_EXIT_USAGE;
      }
      const project = await claw.projects.update(id, {
        name: flags.name || flags.title,
        description: flags.description,
        status: flags.status as "draft" | "in_progress" | "paused" | "done" | "archived" | undefined,
        goalId: flags["goal-id"],
        ownerPersonId: flags["owner-person-id"],
        leadAgentId: flags["lead-agent-id"],
        companyId: flags["company-id"],
        portfolioId: flags["portfolio-id"],
        portfolioItemId: flags["portfolio-item-id"],
        color: flags.color,
        kind: flags.kind as "delivery" | "growth" | "ops" | "research" | "migration" | "other" | undefined,
        healthStatus: flags["health-status"] as "green" | "yellow" | "red" | "unknown" | undefined,
        startDate: flags["start-date"],
        targetDate: flags["target-date"],
      });
      if (wantsJson) writeJson(context.stdout, project);
      else context.stdout.write(`${project.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "delete") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw projects delete <id>\n");
        return CLI_EXIT_USAGE;
      }
      const removed = await claw.projects.remove(id);
      if (!removed) return CLI_EXIT_FAILURE;
      if (wantsJson) writeJson(context.stdout, { ok: true });
      else context.stdout.write("ok\n");
      return CLI_EXIT_OK;
    }
    if (command === "search") {
      const query = subcommand || flags.query;
      if (!query) {
        context.stderr.write("Usage: claw projects search <query>\n");
        return CLI_EXIT_USAGE;
      }
      const results = await claw.projects.search(query, {
        strategy: flags.strategy as "auto" | "keyword" | "semantic" | "hybrid" | undefined,
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, results);
      else context.stdout.write(`${results.map((result) => `${result.score.toFixed(1)} ${result.id} ${result.title}`).join("\n")}\n`);
      return results.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
  }

  if (group === "reminders") {
    const claw = await createCliWorkspaceClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, context.cwd);
    if (command === "list") {
      const reminders = await claw.reminders.list({
        ...(flags.status ? { status: parseCsvFlag(flags.status) as Array<"active" | "paused" | "done" | "cancelled"> } : {}),
        ...(flags["anchor-id"] ? { anchorId: flags["anchor-id"] } : {}),
        ...(flags.before ? { before: flags.before } : {}),
        ...(flags.after ? { after: flags.after } : {}),
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
        includeArchived: readBooleanFlag(argv, flags, "include-archived", false),
      });
      if (wantsJson) writeJson(context.stdout, reminders);
      else context.stdout.write(`${reminders.map((reminder) => `${reminder.status} ${reminder.id} ${reminder.title}`).join("\n")}\n`);
      return reminders.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
    if (command === "get") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw reminders get <id> [--json]\n");
        return CLI_EXIT_USAGE;
      }
      const reminder = await claw.reminders.get(id);
      if (!reminder) return CLI_EXIT_FAILURE;
      if (wantsJson) writeJson(context.stdout, reminder);
      else context.stdout.write(`${reminder.status} ${reminder.id} ${reminder.title}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "create") {
      const title = subcommand || flags.title;
      if (!title || !flags["trigger-at"]) {
        context.stderr.write("Usage: claw reminders create <title> --trigger-at ISO [--anchor-type TYPE --anchor-id ID]\n");
        return CLI_EXIT_USAGE;
      }
      const reminder = await claw.reminders.create({
        title,
        description: flags.description,
        status: flags.status as "active" | "paused" | "done" | "cancelled" | undefined,
        triggerAt: flags["trigger-at"],
        anchorType: flags["anchor-type"] as "task" | "project" | "goal" | "event" | "thread" | "standalone" | undefined,
        anchorId: flags["anchor-id"],
        channel: flags.channel,
      });
      if (wantsJson) writeJson(context.stdout, reminder);
      else context.stdout.write(`${reminder.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "update") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw reminders update <id> [--title TEXT] [--trigger-at ISO]\n");
        return CLI_EXIT_USAGE;
      }
      const reminder = await claw.reminders.update(id, {
        title: flags.title,
        description: flags.description,
        status: flags.status as "active" | "paused" | "done" | "cancelled" | undefined,
        triggerAt: flags["trigger-at"],
        anchorType: flags["anchor-type"] as "task" | "project" | "goal" | "event" | "thread" | "standalone" | undefined,
        anchorId: flags["anchor-id"],
        channel: flags.channel,
      });
      if (wantsJson) writeJson(context.stdout, reminder);
      else context.stdout.write(`${reminder.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "pause" || command === "resume") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write(`Usage: claw reminders ${command} <id>\n`);
        return CLI_EXIT_USAGE;
      }
      const reminder = command === "pause"
        ? await claw.reminders.pause(id)
        : await claw.reminders.resume(id);
      if (wantsJson) writeJson(context.stdout, reminder);
      else context.stdout.write(`${reminder.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "delete") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw reminders delete <id>\n");
        return CLI_EXIT_USAGE;
      }
      const removed = await claw.reminders.remove(id);
      if (!removed) return CLI_EXIT_FAILURE;
      if (wantsJson) writeJson(context.stdout, { ok: true });
      else context.stdout.write("ok\n");
      return CLI_EXIT_OK;
    }
    if (command === "search") {
      const query = subcommand || flags.query;
      if (!query) {
        context.stderr.write("Usage: claw reminders search <query>\n");
        return CLI_EXIT_USAGE;
      }
      const results = await claw.reminders.search(query, {
        strategy: flags.strategy as "auto" | "keyword" | "semantic" | "hybrid" | undefined,
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, results);
      else context.stdout.write(`${results.map((result) => `${result.score.toFixed(1)} ${result.id} ${result.title}`).join("\n")}\n`);
      return results.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
  }

  if (group === "deadlines") {
    const claw = await createCliWorkspaceClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, context.cwd);
    if (command === "list") {
      const deadlines = await claw.deadlines.list({
        ...(flags.status ? { status: parseCsvFlag(flags.status) as Array<"active" | "paused" | "done" | "cancelled"> } : {}),
        ...(flags["anchor-id"] ? { anchorId: flags["anchor-id"] } : {}),
        ...(flags.before ? { before: flags.before } : {}),
        ...(flags.after ? { after: flags.after } : {}),
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
        includeArchived: readBooleanFlag(argv, flags, "include-archived", false),
      });
      if (wantsJson) writeJson(context.stdout, deadlines);
      else context.stdout.write(`${deadlines.map((deadline) => `${deadline.status} ${deadline.id} ${deadline.title}`).join("\n")}\n`);
      return deadlines.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
    if (command === "get") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw deadlines get <id> [--json]\n");
        return CLI_EXIT_USAGE;
      }
      const deadline = await claw.deadlines.get(id);
      if (!deadline) return CLI_EXIT_FAILURE;
      if (wantsJson) writeJson(context.stdout, deadline);
      else context.stdout.write(`${deadline.status} ${deadline.id} ${deadline.title}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "create") {
      const title = subcommand || flags.title;
      if (!title || !flags["due-at"]) {
        context.stderr.write("Usage: claw deadlines create <title> --due-at ISO [--anchor-type TYPE --anchor-id ID]\n");
        return CLI_EXIT_USAGE;
      }
      const deadline = await claw.deadlines.create({
        title,
        description: flags.description,
        status: flags.status as "active" | "paused" | "done" | "cancelled" | undefined,
        dueAt: flags["due-at"],
        anchorType: flags["anchor-type"] as "task" | "project" | "goal" | "event" | "thread" | "standalone" | undefined,
        anchorId: flags["anchor-id"],
      });
      if (wantsJson) writeJson(context.stdout, deadline);
      else context.stdout.write(`${deadline.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "update") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw deadlines update <id> [--title TEXT] [--due-at ISO]\n");
        return CLI_EXIT_USAGE;
      }
      const deadline = await claw.deadlines.update(id, {
        title: flags.title,
        description: flags.description,
        status: flags.status as "active" | "paused" | "done" | "cancelled" | undefined,
        dueAt: flags["due-at"],
        anchorType: flags["anchor-type"] as "task" | "project" | "goal" | "event" | "thread" | "standalone" | undefined,
        anchorId: flags["anchor-id"],
      });
      if (wantsJson) writeJson(context.stdout, deadline);
      else context.stdout.write(`${deadline.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "pause" || command === "resume") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write(`Usage: claw deadlines ${command} <id>\n`);
        return CLI_EXIT_USAGE;
      }
      const deadline = command === "pause"
        ? await claw.deadlines.pause(id)
        : await claw.deadlines.resume(id);
      if (wantsJson) writeJson(context.stdout, deadline);
      else context.stdout.write(`${deadline.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "delete") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw deadlines delete <id>\n");
        return CLI_EXIT_USAGE;
      }
      const removed = await claw.deadlines.remove(id);
      if (!removed) return CLI_EXIT_FAILURE;
      if (wantsJson) writeJson(context.stdout, { ok: true });
      else context.stdout.write("ok\n");
      return CLI_EXIT_OK;
    }
    if (command === "search") {
      const query = subcommand || flags.query;
      if (!query) {
        context.stderr.write("Usage: claw deadlines search <query>\n");
        return CLI_EXIT_USAGE;
      }
      const results = await claw.deadlines.search(query, {
        strategy: flags.strategy as "auto" | "keyword" | "semantic" | "hybrid" | undefined,
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, results);
      else context.stdout.write(`${results.map((result) => `${result.score.toFixed(1)} ${result.id} ${result.title}`).join("\n")}\n`);
      return results.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
  }

  if (group === "notes") {
    const claw = await createCliWorkspaceClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, context.cwd);
    if (command === "list") {
      const notes = await claw.notes.list({
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
        includeArchived: readBooleanFlag(argv, flags, "include-archived", false),
      });
      if (wantsJson) writeJson(context.stdout, notes);
      else context.stdout.write(`${notes.map((note) => `${note.id} ${note.title}`).join("\n")}\n`);
      return notes.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
    if (command === "get") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw notes get <id>\n");
        return CLI_EXIT_USAGE;
      }
      const note = await claw.notes.get(id);
      if (!note) return CLI_EXIT_FAILURE;
      if (wantsJson) writeJson(context.stdout, note);
      else context.stdout.write(`${note.id} ${note.title}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "create") {
      const title = subcommand || flags.title;
      if (!title) {
        context.stderr.write("Usage: claw notes create <title> [--content TEXT] [--tags a,b]\n");
        return CLI_EXIT_USAGE;
      }
      const note = await claw.notes.create({
        title,
        content: flags.content,
        tags: parseCsvFlag(flags.tags),
        summary: flags.summary,
      });
      if (wantsJson) writeJson(context.stdout, note);
      else context.stdout.write(`${note.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "update") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw notes update <id> [--title TEXT] [--content TEXT] [--tags a,b]\n");
        return CLI_EXIT_USAGE;
      }
      const note = await claw.notes.update(id, {
        title: flags.title,
        content: flags.content,
        ...(flags.tags ? { tags: parseCsvFlag(flags.tags) } : {}),
        summary: flags.summary,
      });
      if (wantsJson) writeJson(context.stdout, note);
      else context.stdout.write(`${note.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "search") {
      const query = subcommand || flags.query;
      if (!query) {
        context.stderr.write("Usage: claw notes search <query>\n");
        return CLI_EXIT_USAGE;
      }
      const results = await claw.notes.search(query, {
        strategy: flags.strategy as "auto" | "keyword" | "semantic" | "hybrid" | undefined,
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, results);
      else context.stdout.write(`${results.map((result) => `${result.score.toFixed(1)} ${result.id} ${result.title}`).join("\n")}\n`);
      return results.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
  }

  if (group === "people") {
    const claw = await createCliWorkspaceClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, context.cwd);
    if (command === "list") {
      const people = await claw.people.list({
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
        includeArchived: readBooleanFlag(argv, flags, "include-archived", false),
      });
      if (wantsJson) writeJson(context.stdout, people);
      else context.stdout.write(`${people.map((person) => `${person.id} ${person.displayName}`).join("\n")}\n`);
      return people.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
    if (command === "get") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw people get <id>\n");
        return CLI_EXIT_USAGE;
      }
      const person = await claw.people.get(id);
      if (!person) return CLI_EXIT_FAILURE;
      if (wantsJson) writeJson(context.stdout, person);
      else context.stdout.write(`${person.id} ${person.displayName}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "upsert") {
      const displayName = subcommand || flags.name || flags.title;
      if (!displayName) {
        context.stderr.write("Usage: claw people upsert <display-name> [--kind human|agent|org] [--email a@b.com]\n");
        return CLI_EXIT_USAGE;
      }
      const person = await claw.people.upsert({
        id: flags.id,
        displayName,
        kind: flags.kind as "human" | "agent" | "org" | undefined,
        emails: parseCsvFlag(flags.email),
        phones: parseCsvFlag(flags.phone),
        handles: parseCsvFlag(flags.handle),
        identities: flags.channel && flags.handle
          ? [{ channel: flags.channel, handle: parseCsvFlag(flags.handle)[0] || flags.handle, externalId: flags["external-id"], label: displayName }]
          : undefined,
        role: flags.role,
        organization: flags.organization,
      });
      if (wantsJson) writeJson(context.stdout, person);
      else context.stdout.write(`${person.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "search") {
      const query = subcommand || flags.query;
      if (!query) {
        context.stderr.write("Usage: claw people search <query>\n");
        return CLI_EXIT_USAGE;
      }
      const results = await claw.people.search(query, {
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, results);
      else context.stdout.write(`${results.map((result) => `${result.score.toFixed(1)} ${result.id} ${result.title}`).join("\n")}\n`);
      return results.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
  }

  if (group === "inbox") {
    const claw = await createCliWorkspaceClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, context.cwd);
    if (command === "list") {
      const threads = await claw.inbox.list({
        unreadOnly: readBooleanFlag(argv, flags, "unread-only", false),
        includeArchived: readBooleanFlag(argv, flags, "include-archived", false),
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, threads);
      else context.stdout.write(`${threads.map((thread) => `${thread.status} ${thread.id} ${thread.subject ?? ""}`.trim()).join("\n")}\n`);
      return threads.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
    if (command === "read") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw inbox read <thread-id>\n");
        return CLI_EXIT_USAGE;
      }
      const thread = await claw.inbox.readThread(id);
      if (!thread) return CLI_EXIT_FAILURE;
      if (wantsJson) writeJson(context.stdout, thread);
      else context.stdout.write(`${thread.thread.id} ${thread.messages.length}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "search") {
      const query = subcommand || flags.query;
      if (!query) {
        context.stderr.write("Usage: claw inbox search <query>\n");
        return CLI_EXIT_USAGE;
      }
      const results = await claw.inbox.search(query, {
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
        strategy: flags.strategy as "auto" | "keyword" | "semantic" | "hybrid" | undefined,
      });
      if (wantsJson) writeJson(context.stdout, results);
      else context.stdout.write(`${results.map((result) => `${result.score.toFixed(1)} ${result.id} ${result.title}`).join("\n")}\n`);
      return results.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
    if (command === "draft") {
      const content = flags.content || subcommand;
      const channel = flags.channel || "local";
      if (!content) {
        context.stderr.write("Usage: claw inbox draft <content> [--thread THREAD_ID] [--channel CHANNEL]\n");
        return CLI_EXIT_USAGE;
      }
      const thread = await claw.inbox.createDraft({
        threadId: flags.thread,
        channel,
        subject: flags.subject,
        content,
        participantPersonIds: parseCsvFlag(flags.participants),
      });
      if (wantsJson) writeJson(context.stdout, thread);
      else context.stdout.write(`${thread.thread.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "archive") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw inbox archive <thread-id>\n");
        return CLI_EXIT_USAGE;
      }
      const thread = await claw.inbox.archive(id);
      if (wantsJson) writeJson(context.stdout, thread);
      else context.stdout.write(`${thread.id}\n`);
      return CLI_EXIT_OK;
    }
  }

  if (group === "events") {
    const claw = await createCliWorkspaceClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, context.cwd);
    if (command === "list") {
      const events = await claw.events.list({
        upcomingOnly: readBooleanFlag(argv, flags, "upcoming-only", false),
        includeArchived: readBooleanFlag(argv, flags, "include-archived", false),
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, events);
      else context.stdout.write(`${events.map((event) => `${event.id} ${event.title} ${event.startsAt}`).join("\n")}\n`);
      return events.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
    if (command === "get") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw events get <id>\n");
        return CLI_EXIT_USAGE;
      }
      const event = await claw.events.get(id);
      if (!event) return CLI_EXIT_FAILURE;
      if (wantsJson) writeJson(context.stdout, event);
      else context.stdout.write(`${event.id} ${event.title}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "create") {
      const title = subcommand || flags.title;
      if (!title || !flags["starts-at"]) {
        context.stderr.write("Usage: claw events create <title> --starts-at ISO [--ends-at ISO] [--location TEXT]\n");
        return CLI_EXIT_USAGE;
      }
      const event = await claw.events.create({
        title,
        startsAt: flags["starts-at"],
        endsAt: flags["ends-at"],
        location: flags.location,
        description: flags.description,
        attendeePersonIds: parseCsvFlag(flags.attendees),
      });
      if (wantsJson) writeJson(context.stdout, event);
      else context.stdout.write(`${event.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "update") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw events update <id> [--title TEXT] [--starts-at ISO]\n");
        return CLI_EXIT_USAGE;
      }
      const event = await claw.events.update(id, {
        title: flags.title,
        startsAt: flags["starts-at"],
        endsAt: flags["ends-at"],
        location: flags.location,
        description: flags.description,
        ...(flags.attendees ? { attendeePersonIds: parseCsvFlag(flags.attendees) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, event);
      else context.stdout.write(`${event.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "search") {
      const query = subcommand || flags.query;
      if (!query) {
        context.stderr.write("Usage: claw events search <query>\n");
        return CLI_EXIT_USAGE;
      }
      const results = await claw.events.search(query, {
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, results);
      else context.stdout.write(`${results.map((result) => `${result.score.toFixed(1)} ${result.id} ${result.title}`).join("\n")}\n`);
      return results.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
  }

  if (group === "workspace-search" && command === "query") {
    const query = subcommand || flags.query;
    if (!query) {
      context.stderr.write("Usage: claw workspace-search query <query> [--domains tasks,notes,...]\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliWorkspaceClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, context.cwd);
    const results = await claw.search.query({
      query,
      domains: parseCsvFlag(flags.domains) as Array<"tasks" | "goals" | "projects" | "reminders" | "deadlines" | "notes" | "people" | "inbox" | "events">,
      strategy: flags.strategy as "auto" | "keyword" | "semantic" | "hybrid" | undefined,
      ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      includeArchived: readBooleanFlag(argv, flags, "include-archived", false),
    });
    if (wantsJson) writeJson(context.stdout, results);
    else context.stdout.write(`${results.map((result) => `${result.domain} ${result.score.toFixed(1)} ${result.id} ${result.title}`).join("\n")}\n`);
    return results.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "workspace-index" && command === "rebuild") {
    const claw = await createCliWorkspaceClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, context.cwd);
    const result = await claw.workspaceIndex.rebuild();
    if (wantsJson) writeJson(context.stdout, result);
    else context.stdout.write(`reindexed=${result.reindexed} embeddings=${result.embeddings}\n`);
    return CLI_EXIT_OK;
  }

  if (group === "skills" && command === "list") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const skills = await claw.skills.list();
    if (wantsJson) {
      writeJson(context.stdout, skills);
    } else {
      context.stdout.write(`${skills.map((entry) => `${entry.enabled ? "*" : "-"} ${entry.id}`).join("\n")}\n`);
    }
    return skills.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "skills" && command === "sources") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const sources = await claw.skills.sources();
    if (wantsJson) {
      writeJson(context.stdout, sources);
    } else {
      context.stdout.write(`${sources.map((entry) => {
        const caps = Object.entries(entry.capabilities)
          .filter(([, enabled]) => enabled)
          .map(([name]) => name)
          .join(",");
        return `${entry.status === "ready" ? "*" : "-"} ${entry.id} ${entry.status}${caps ? ` ${caps}` : ""}`;
      }).join("\n")}\n`);
    }
    return sources.some((entry) => entry.status === "ready") ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "skills" && command === "search") {
    const query = flags.query;
    if (!query) {
      context.stderr.write("--query is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const result = await claw.skills.search(query, {
      source: flags.source,
      ...(flags.limit ? { limit: Number(flags.limit) } : {}),
    });
    if (wantsJson) {
      writeJson(context.stdout, result);
    } else {
      if (result.entries.length === 0) {
        context.stdout.write("no matches\n");
      } else {
        context.stdout.write(`${result.entries.map((entry) => {
          const summary = entry.summary ? ` ${entry.summary}` : "";
          return `${entry.source}:${entry.slug} ${entry.label}${summary}`;
        }).join("\n")}\n`);
      }
      if (result.omittedSources?.length) {
        context.stdout.write(`${result.omittedSources.map((entry) => `omitted ${entry.source}: ${entry.reason}`).join("\n")}\n`);
      }
    }
    return result.entries.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "skills" && (command === "sync" || command === "inspect")) {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const skills = command === "sync" ? await claw.skills.sync() : await claw.skills.list();
    if (wantsJson) {
      writeJson(context.stdout, skills);
    } else {
      context.stdout.write(`${skills.map((entry) => entry.id).join("\n")}\n`);
    }
    return skills.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "skills" && command === "install") {
    const ref = subcommand;
    if (!ref) {
      context.stderr.write("Usage: claw skills install <ref> [--source clawhub|skills.sh] [--json]\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const result = await claw.skills.install(ref, {
      source: flags.source,
    });
    if (wantsJson) {
      writeJson(context.stdout, result);
    } else {
      const synced = result.syncedSkills ? ` synced=${result.syncedSkills.length}` : "";
      context.stdout.write(`installed ${result.source}:${result.slug} visibility=${result.runtimeVisibility}${synced}\n`);
      if (result.installedPaths?.length) {
        context.stdout.write(`${result.installedPaths.join("\n")}\n`);
      }
      if (result.warnings?.length) {
        context.stdout.write(`${result.warnings.join("\n")}\n`);
      }
    }
    return CLI_EXIT_OK;
  }

  if (group === "channels" && (command === "list" || command === "status")) {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const channels = await claw.channels.list();
    if (wantsJson) {
      writeJson(context.stdout, channels);
    } else {
      context.stdout.write(`${channels.map((entry) => `${entry.id}:${entry.status}`).join("\n")}\n`);
    }
    return channels.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "telegram" && command === "connect") {
    const secretName = flags["secret-name"];
    if (!secretName) {
      context.stderr.write("--secret-name is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const status = await claw.telegram.connectBot({
      secretName,
      apiBaseUrl: flags["api-base-url"],
      webhookUrl: flags["webhook-url"],
      webhookSecretToken: flags["webhook-secret-token"],
      allowedUpdates: parseJsonFlag<string[]>(flags["allowed-updates"], "--allowed-updates"),
      ...(flags["drop-pending-updates"] !== undefined ? { dropPendingUpdates: readBooleanFlag(argv, flags, "drop-pending-updates", false) } : {}),
    });
    if (wantsJson) {
      writeJson(context.stdout, status);
    } else {
      context.stdout.write(`${status.channel.status} ${status.transport.mode}\n`);
    }
    return status.channel.status === "connected" ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "telegram" && command === "status") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const status = await claw.telegram.status();
    if (wantsJson) {
      writeJson(context.stdout, status);
    } else {
      context.stdout.write(`status: ${status.channel.status}\n`);
      context.stdout.write(`mode: ${status.transport.mode}\n`);
      context.stdout.write(`bot: ${status.botProfile?.username ?? "unknown"}\n`);
    }
    return status.channel.status === "connected" ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "telegram" && command === "webhook" && subcommand === "set") {
    const url = flags.url || flags["webhook-url"];
    if (!url) {
      context.stderr.write("--url is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const status = await claw.telegram.configureWebhook({
      url,
      secretToken: flags["webhook-secret-token"],
      allowedUpdates: parseJsonFlag<string[]>(flags["allowed-updates"], "--allowed-updates"),
      ...(flags["drop-pending-updates"] !== undefined ? { dropPendingUpdates: readBooleanFlag(argv, flags, "drop-pending-updates", false) } : {}),
      ...(flags["max-connections"] ? { maxConnections: Number(flags["max-connections"]) } : {}),
      ...(flags["ip-address"] ? { ipAddress: flags["ip-address"] } : {}),
    });
    if (wantsJson) {
      writeJson(context.stdout, status);
    } else {
      context.stdout.write(`${status.transport.webhook?.url ?? "configured"}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "telegram" && command === "webhook" && subcommand === "clear") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const status = await claw.telegram.disableWebhook({
      ...(flags["drop-pending-updates"] !== undefined ? { dropPendingUpdates: readBooleanFlag(argv, flags, "drop-pending-updates", false) } : {}),
    });
    if (wantsJson) {
      writeJson(context.stdout, status);
    } else {
      context.stdout.write(`${status.transport.mode}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "telegram" && command === "polling" && subcommand === "start") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const status = await claw.telegram.startPolling({
      ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      ...(flags.timeout ? { timeoutSeconds: Number(flags.timeout) } : {}),
      ...(flags["allowed-updates"] ? { allowedUpdates: parseJsonFlag<string[]>(flags["allowed-updates"], "--allowed-updates") } : {}),
      ...(flags["drop-pending-updates"] !== undefined ? { dropPendingUpdates: readBooleanFlag(argv, flags, "drop-pending-updates", false) } : {}),
    });
    if (wantsJson) {
      writeJson(context.stdout, status);
    } else {
      context.stdout.write(`${status.transport.mode}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "telegram" && command === "polling" && subcommand === "stop") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const status = await claw.telegram.stopPolling();
    if (wantsJson) {
      writeJson(context.stdout, status);
    } else {
      context.stdout.write(`${status.transport.active}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "telegram" && command === "commands" && subcommand === "set") {
    const commands = parseJsonFlag<Array<{ command: string; description: string }>>(flags.commands, "--commands");
    if (!commands) {
      context.stderr.write("--commands is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const saved = await claw.telegram.setCommands(commands);
    if (wantsJson) {
      writeJson(context.stdout, saved);
    } else {
      context.stdout.write(`${saved.map((entry) => entry.command).join("\n")}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "telegram" && command === "commands" && subcommand === "get") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const commands = await claw.telegram.getCommands();
    if (wantsJson) {
      writeJson(context.stdout, commands);
    } else {
      context.stdout.write(`${commands.map((entry) => `${entry.command}: ${entry.description}`).join("\n")}\n`);
    }
    return commands.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "telegram" && command === "chats" && subcommand === "list") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const chats = await claw.telegram.listChats(flags.query);
    if (wantsJson) {
      writeJson(context.stdout, chats);
    } else {
      context.stdout.write(`${chats.map((entry) => `${entry.id} ${entry.title ?? entry.username ?? entry.firstName ?? ""}`.trim()).join("\n")}\n`);
    }
    return chats.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "telegram" && command === "chats" && subcommand === "inspect") {
    const chatId = flags["chat-id"];
    if (!chatId) {
      context.stderr.write("--chat-id is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const chat = await claw.telegram.getChat(chatId);
    if (wantsJson) {
      writeJson(context.stdout, chat);
    } else {
      context.stdout.write(`${chat.id} ${chat.type}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "telegram" && command === "send") {
    const chatId = flags["chat-id"];
    if (!chatId) {
      context.stderr.write("--chat-id is required\n");
      return CLI_EXIT_USAGE;
    }
    if (!flags.media && !flags.text) {
      context.stderr.write("--text or --media is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const response = flags.media
      ? await claw.telegram.sendMedia({
        type: (flags.type as TelegramSendMediaInput["type"] | undefined) ?? "photo",
        chatId,
        media: flags.media,
        caption: flags.caption,
        ...(flags["parse-mode"] ? { parseMode: flags["parse-mode"] as TelegramSendMediaInput["parseMode"] } : {}),
        ...(flags["reply-to-message-id"] ? { replyToMessageId: Number(flags["reply-to-message-id"]) } : {}),
        ...(flags["message-thread-id"] ? { messageThreadId: Number(flags["message-thread-id"]) } : {}),
      })
      : await claw.telegram.sendMessage({
        chatId,
        text: flags.text ?? "",
        ...(flags["parse-mode"] ? { parseMode: flags["parse-mode"] as TelegramSendMessageInput["parseMode"] } : {}),
        ...(flags["reply-to-message-id"] ? { replyToMessageId: Number(flags["reply-to-message-id"]) } : {}),
        ...(flags["message-thread-id"] ? { messageThreadId: Number(flags["message-thread-id"]) } : {}),
      });
    if (wantsJson) {
      writeJson(context.stdout, response);
    } else {
      context.stdout.write("ok\n");
    }
    return CLI_EXIT_OK;
  }

  if (group === "files" && command === "diff") {
    const targetFile = flags.file;
    const blockId = flags["block-id"];
    const settingsKey = flags.key || "value";
    const value = flags.value ?? "";
    if (!targetFile || !blockId) {
      context.stderr.write("--file and --block-id are required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const diff = claw.files.diffBinding({
      id: `${targetFile}:${blockId}`,
      targetFile,
      mode: "managed_block",
      blockId,
      settingsPath: settingsKey,
    }, { [settingsKey]: value }, (settings) => `${settingsKey}=${String((settings as Record<string, unknown>)[settingsKey] ?? "")}`);
    if (wantsJson) {
      writeJson(context.stdout, diff);
    } else {
      context.stdout.write(`${diff.changed}\n`);
    }
    return diff.changed ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
  }

  if (group === "files" && command === "apply-template-pack") {
    const templatePackPath = flags["template-pack"];
    if (!templatePackPath) {
      context.stderr.write("--template-pack is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const result = await claw.files.applyTemplatePack(templatePackPath);
    if (wantsJson) {
      writeJson(context.stdout, result);
    } else {
      context.stdout.write(`${result.filter((entry) => entry.changed).length}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "files" && command === "read") {
    const targetFile = flags.file;
    if (!targetFile) {
      context.stderr.write("--file is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const content = claw.files.readWorkspaceFile(targetFile);
    if (wantsJson) {
      writeJson(context.stdout, { file: targetFile, content });
    } else {
      context.stdout.write(`${content ?? ""}`);
    }
    return content === null ? CLI_EXIT_FAILURE : CLI_EXIT_OK;
  }

  if (group === "files" && command === "write") {
    const targetFile = flags.file;
    const value = flags.value ?? "";
    if (!targetFile) {
      context.stderr.write("--file is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const result = claw.files.writeWorkspaceFile(targetFile, value);
    if (wantsJson) {
      writeJson(context.stdout, result);
    } else {
      context.stdout.write(`${result.filePath}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "files" && command === "inspect") {
    const targetFile = flags.file;
    if (!targetFile) {
      context.stderr.write("--file is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const inspection = claw.files.inspectWorkspaceFile(targetFile);
    if (wantsJson) {
      writeJson(context.stdout, inspection);
    } else {
      context.stdout.write(`${inspection.filePath}\n`);
    }
    return inspection.exists ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
  }

  if (group === "files" && command === "sync") {
    const targetFile = flags.file;
    const blockId = flags["block-id"];
    const settingsKey = flags.key || "value";
    const value = flags.value ?? "";
    if (!targetFile || !blockId) {
      context.stderr.write("--file and --block-id are required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const syncResult = claw.files.syncBinding({
      id: `${targetFile}:${blockId}`,
      targetFile,
      mode: "managed_block",
      blockId,
      settingsPath: settingsKey,
    }, { [settingsKey]: value }, (settings) => `${settingsKey}=${String((settings as Record<string, unknown>)[settingsKey] ?? "")}`);
    if (wantsJson) {
      writeJson(context.stdout, syncResult);
    } else {
      context.stdout.write(`${syncResult.filePath}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "sessions" && command === "create") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const title = flags.title;
    const session = claw.sessions.createSession(title);
    if (wantsJson) {
      writeJson(context.stdout, session);
    } else {
      context.stdout.write(`${session.sessionId}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "sessions" && command === "read") {
    const sessionId = flags["session-id"];
    if (!sessionId) {
      context.stderr.write("--session-id is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const session = claw.sessions.getSession(sessionId);
    if (wantsJson) {
      writeJson(context.stdout, session);
    } else {
      context.stdout.write(`${session?.title ?? "missing"}\n`);
    }
    return session ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
  }

  if (group === "sessions" && command === "generate-title") {
    const sessionId = flags["session-id"];
    if (!sessionId) {
      context.stderr.write("--session-id is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const title = await claw.sessions.generateTitle({
      sessionId,
      transport: (flags.transport as "auto" | "gateway" | "cli" | undefined) ?? "auto",
    });
    if (wantsJson) {
      writeJson(context.stdout, { sessionId, title });
    } else {
      context.stdout.write(`${title}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "sessions" && command === "list") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const sessions = claw.sessions.listSessions();
    if (wantsJson) {
      writeJson(context.stdout, sessions);
    } else {
      context.stdout.write(`${sessions.map((session) => `${session.sessionId} ${session.title}`).join("\n")}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "sessions" && command === "search") {
    const query = flags.query || subcommand;
    if (!query?.trim()) {
      context.stderr.write("--query is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const results = await claw.sessions.searchSessions({
      query: query.trim(),
      strategy: (flags.strategy as "auto" | "local" | "openclaw-memory" | undefined) ?? "auto",
      ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      ...(flags["min-score"] ? { minScore: Number(flags["min-score"]) } : {}),
      includeMessages: argv.includes("--no-messages") ? false : readBooleanFlag(argv, flags, "include-messages", true),
      fallbackToLocal: argv.includes("--no-local-fallback") ? false : readBooleanFlag(argv, flags, "fallback-to-local", true),
    });
    if (wantsJson) {
      writeJson(context.stdout, results);
    } else {
      context.stdout.write(`${results.map((result) => `${result.sessionId} ${result.title}`).join("\n")}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "sessions" && command === "stream") {
    const sessionId = flags["session-id"];
    if (!sessionId) {
      context.stderr.write("--session-id is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const transport = (flags.transport as "auto" | "gateway" | "cli" | undefined) ?? "auto";
    const baseInput = {
      sessionId,
      systemPrompt: flags["system-prompt"],
      contextBlocks: parseContextBlock(flags.context),
      transport,
      ...(flags["chunk-size"] ? { chunkSize: Number(flags["chunk-size"]) } : {}),
      ...(flags["gateway-retries"] ? { gatewayRetries: Number(flags["gateway-retries"]) } : {}),
    };

    if (argv.includes("--events")) {
      const events: unknown[] = [];
      let exitCode = 0;
      for await (const event of claw.sessions.streamAssistantReplyEvents(baseInput)) {
        if (event.type === "error" || event.type === "aborted") {
          exitCode = 1;
        }
        if (wantsJson) {
          events.push(event.type === "error" ? { ...event, error: event.error.message } : event);
          continue;
        }
        if (event.type === "chunk") {
          context.stdout.write(event.chunk.delta);
          continue;
        }
        writeJsonLine(context.stdout, event.type === "error" ? { ...event, error: event.error.message } : event);
      }
      if (wantsJson) {
        writeJson(context.stdout, events);
      }
      return exitCode;
    }

    const chunks: string[] = [];
    for await (const chunk of claw.sessions.streamAssistantReply(baseInput)) {
      if (chunk.done) continue;
      chunks.push(chunk.delta);
      if (!wantsJson) {
        context.stdout.write(chunk.delta);
      }
    }

    if (wantsJson) {
      writeJson(context.stdout, {
        sessionId,
        text: chunks.join(""),
        chunks,
      });
    }
    return CLI_EXIT_OK;
  }

  if (group === "documents" && command === "list") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const documents = await claw.documents.list(flags["session-id"] ? { sessionId: flags["session-id"] } : undefined);
    if (wantsJson) {
      writeJson(context.stdout, documents);
    } else {
      context.stdout.write(`${documents.map((document) => `${document.documentId} ${document.name}`).join("\n")}\n`);
    }
    return documents.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "documents" && command === "read") {
    const documentId = flags["document-id"] ?? flags.id;
    if (!documentId) {
      context.stderr.write("--document-id is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const document = await claw.documents.get(documentId);
    if (wantsJson) {
      writeJson(context.stdout, document);
    } else {
      context.stdout.write(`${document?.name ?? "missing"}\n`);
    }
    return document ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
  }

  if (group === "documents" && command === "search") {
    const query = flags.query || subcommand;
    if (!query?.trim()) {
      context.stderr.write("--query is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const results = await claw.documents.search({
      query: query.trim(),
      ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      ...(flags["session-id"] ? { sessionId: flags["session-id"] } : {}),
    });
    if (wantsJson) {
      writeJson(context.stdout, results);
    } else {
      context.stdout.write(`${results.map((document) => `${document.documentId} ${document.name}`).join("\n")}\n`);
    }
    return results.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "documents" && command === "upload") {
    const sourceFile = flags.file;
    if (!sourceFile) {
      context.stderr.write("--file is required\n");
      return CLI_EXIT_USAGE;
    }
    const filePath = path.resolve(context.cwd, sourceFile);
    const data = fs.readFileSync(filePath);
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const document = await claw.documents.upload({
      name: flags.name || path.basename(filePath),
      mimeType: flags["mime-type"] || inferMimeTypeFromPath(filePath),
      data: data.toString("base64"),
      ...(flags["session-id"] ? { sessionId: flags["session-id"] } : {}),
    });
    if (wantsJson) {
      writeJson(context.stdout, document);
    } else {
      context.stdout.write(`${document.documentId}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "documents" && command === "register") {
    const sourceFile = flags.file;
    if (!sourceFile) {
      context.stderr.write("--file is required\n");
      return CLI_EXIT_USAGE;
    }
    const filePath = path.resolve(context.cwd, sourceFile);
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const document = await claw.documents.register({
      filePath,
      ...(flags.name ? { name: flags.name } : {}),
      ...(flags["mime-type"] ? { mimeType: flags["mime-type"] } : {}),
      ...(flags["session-id"] ? { sessionId: flags["session-id"] } : {}),
    });
    if (wantsJson) {
      writeJson(context.stdout, document);
    } else {
      context.stdout.write(`${document.documentId}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "documents" && command === "download") {
    const documentId = flags["document-id"] ?? flags.id;
    if (!documentId) {
      context.stderr.write("--document-id is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const download = await claw.documents.download(documentId);
    if (!download) {
      if (wantsJson) {
        writeJson(context.stdout, null);
      } else {
        context.stdout.write("missing\n");
      }
      return CLI_EXIT_FAILURE;
    }
    const outputPath = path.resolve(
      context.cwd,
      flags.out || flags.output || download.document.name,
    );
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, download.buffer);
    if (wantsJson) {
      writeJson(context.stdout, {
        document: download.document,
        outputPath,
        sizeBytes: download.buffer.length,
      });
    } else {
      context.stdout.write(`${outputPath}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "inference" && command === "generate-text") {
    const messages = parseInferenceMessages(flags);
    if (!messages) {
      context.stderr.write("--prompt, --message, --text, or --messages-json is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const result = await claw.inference.generateText({
      messages,
      sessionId: flags["session-id"],
      systemPrompt: flags["system-prompt"],
      contextBlocks: parseContextBlock(flags.context),
      transport: (flags.transport as "auto" | "gateway" | "cli" | undefined) ?? "auto",
      ...(flags.model ? { model: flags.model } : {}),
      ...(flags["chunk-size"] ? { chunkSize: Number(flags["chunk-size"]) } : {}),
      ...(flags["gateway-retries"] ? { gatewayRetries: Number(flags["gateway-retries"]) } : {}),
    });
    if (wantsJson) {
      writeJson(context.stdout, result);
    } else {
      context.stdout.write(`${result.text}\n`);
    }
    return result.text ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "tts" && command === "providers") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const providers = claw.tts.providers();
    if (wantsJson) {
      writeJson(context.stdout, providers);
    } else {
      context.stdout.write(`${providers.map((provider) => provider.id).join("\n")}\n`);
    }
    return providers.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "tts" && command === "catalog") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const catalog = claw.tts.catalog();
    if (wantsJson) {
      writeJson(context.stdout, catalog);
    } else {
      context.stdout.write(`${catalog.providers.map((provider) => provider.id).join("\n")}\n`);
    }
    return catalog.providers.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "tts" && command === "config") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const config = claw.tts.config();
    if (wantsJson) {
      writeJson(context.stdout, config);
    } else {
      context.stdout.write(`${config.provider ?? "local"}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "tts" && command === "set-config") {
    const config = parseJsonFlag<Record<string, unknown>>(flags["config-json"], "--config-json") ?? {
      ...(flags.provider ? { provider: flags.provider } : {}),
      ...(flags.enabled !== undefined || argv.includes("--enabled") ? { enabled: readBooleanFlag(argv, flags, "enabled", false) } : {}),
      ...(flags["auto-read"] !== undefined || argv.includes("--auto-read") ? { autoRead: readBooleanFlag(argv, flags, "auto-read", false) } : {}),
      ...(flags["api-key"] ? { apiKey: flags["api-key"] } : {}),
      ...(flags.voice ? { voice: flags.voice } : {}),
      ...(flags.model ? { model: flags.model } : {}),
      ...(flags.speed ? { speed: Number(flags.speed) } : {}),
      ...(flags.stability ? { stability: Number(flags.stability) } : {}),
      ...(flags["similarity-boost"] ? { similarityBoost: Number(flags["similarity-boost"]) } : {}),
    };
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const next = claw.tts.setConfig(config);
    if (wantsJson) {
      writeJson(context.stdout, next);
    } else {
      context.stdout.write(`${next.provider ?? "local"}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "tts" && command === "synthesize") {
    const text = flags.text ?? flags.prompt ?? subcommand;
    if (!text?.trim()) {
      context.stderr.write("--text is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const result = await claw.tts.synthesize({
      text: text.trim(),
      ...(flags.lang ? { lang: flags.lang } : {}),
      ...(flags.provider ? { provider: flags.provider as "local" | "openai" | "elevenlabs" | "deepgram" } : {}),
      ...(flags["api-key"] ? { apiKey: flags["api-key"] } : {}),
      ...(flags.voice ? { voice: flags.voice } : {}),
      ...(flags.model ? { model: flags.model } : {}),
      ...(flags.speed ? { speed: Number(flags.speed) } : {}),
      ...(flags.stability ? { stability: Number(flags.stability) } : {}),
      ...(flags["similarity-boost"] ? { similarityBoost: Number(flags["similarity-boost"]) } : {}),
    });
    const outputPath = path.resolve(
      context.cwd,
      flags.out || flags.output || `tts-${Date.now()}${inferAudioExtension(result.mimeType)}`,
    );
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, result.audio);
    if (wantsJson) {
      writeJson(context.stdout, {
        outputPath,
        mimeType: result.mimeType,
        sizeBytes: result.audio.length,
      });
    } else {
      context.stdout.write(`${outputPath}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "generations" && command === "backends") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const backends = claw.generations.backends();
    if (wantsJson) {
      writeJson(context.stdout, backends);
    } else {
      context.stdout.write(`${backends.map((backend) => {
        const prefix = backend.available ? "*" : "-";
        const kinds = backend.supportedKinds.length > 0 ? ` ${backend.supportedKinds.join(",")}` : "";
        const reason = backend.reason ? ` ${backend.reason}` : "";
        return `${prefix} ${backend.id} [${backend.source}]${kinds}${reason}`;
      }).join("\n")}\n`);
    }
    return backends.some((backend) => backend.available) ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (mediaGroup && command === "backends") {
    const { media } = await getTypedGenerationFacade(mediaGroup);
    const backends = media.backends();
    if (wantsJson) {
      writeJson(context.stdout, backends);
    } else {
      context.stdout.write(`${backends.map((backend: { available: boolean; reason?: string; id: string; source: string }) => {
        const prefix = backend.available ? "*" : "-";
        const reason = backend.reason ? ` ${backend.reason}` : "";
        return `${prefix} ${backend.id} [${backend.source}]${reason}`;
      }).join("\n")}\n`);
    }
    return backends.some((backend: { available: boolean }) => backend.available) ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (mediaGroup && command === "generate") {
    const prompt = flags.prompt;
    if (!prompt) {
      context.stderr.write("--prompt is required\n");
      return CLI_EXIT_USAGE;
    }
    const metadata = buildMediaMetadata(
      mediaGroup,
      flags,
      parseJsonFlag<Record<string, unknown>>(flags["metadata-json"], "--metadata-json"),
    );
    const { media } = await getTypedGenerationFacade(mediaGroup);
    const record = await media.generate({
      prompt,
      title: flags.title,
      backendId: flags.backend,
      model: flags.model,
      metadata,
      command: flags.command,
      args: parseJsonFlag<string[]>(flags["args-json"], "--args-json"),
      cwd: flags.cwd,
      env: parseJsonFlag<Record<string, string>>(flags["env-json"], "--env-json"),
      outputExtension: flags.ext,
      mimeType: flags["mime-type"],
    });
    if (wantsJson) {
      writeJson(context.stdout, record);
    } else {
      context.stdout.write(`${record.id} ${record.output?.filePath ?? "missing-output"}\n`);
    }
    return record.status === "succeeded" ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
  }

  if (mediaGroup && command === "list") {
    const { media } = await getTypedGenerationFacade(mediaGroup);
    const records = media.list({
      ...(flags.backend ? { backendId: flags.backend } : {}),
      ...(flags.status ? { status: flags.status as "succeeded" | "failed" } : {}),
      ...(flags.limit ? { limit: Number(flags.limit) } : {}),
    });
    if (wantsJson) {
      writeJson(context.stdout, records);
    } else {
      context.stdout.write(`${records.map((record: { id: string; status: string; title: string }) => `${record.id} ${record.status} ${record.title}`).join("\n")}\n`);
    }
    return records.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (mediaGroup && command === "read") {
    const id = flags.id;
    if (!id) {
      context.stderr.write("--id is required\n");
      return CLI_EXIT_USAGE;
    }
    const { media } = await getTypedGenerationFacade(mediaGroup);
    const record = media.get(id);
    if (wantsJson) {
      writeJson(context.stdout, record);
    } else {
      context.stdout.write(`${record?.output?.filePath ?? "missing"}\n`);
    }
    return record ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
  }

  if (mediaGroup && command === "delete") {
    const id = flags.id;
    if (!id) {
      context.stderr.write("--id is required\n");
      return CLI_EXIT_USAGE;
    }
    const { media } = await getTypedGenerationFacade(mediaGroup);
    const removed = media.remove(id);
    if (wantsJson) {
      writeJson(context.stdout, { removed, id });
    } else {
      context.stdout.write(`${removed}\n`);
    }
    return removed ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
  }

  if (group === "generations" && command === "register-command") {
    const id = flags.id;
    const commandValue = flags.command;
    if (!id || !commandValue) {
      context.stderr.write("--id and --command are required\n");
      return CLI_EXIT_USAGE;
    }
    const kinds = parseCsvFlag(flags.kinds);
    if (kinds.length === 0) {
      context.stderr.write("--kinds is required\n");
      return CLI_EXIT_USAGE;
    }
    const args = parseJsonFlag<string[]>(flags["args-json"], "--args-json") ?? [];
    const env = parseJsonFlag<Record<string, string>>(flags["env-json"], "--env-json");
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const backend = claw.generations.registerCommandBackend({
      id,
      label: flags.label || id,
      supportedKinds: kinds as Array<"image" | "video" | "audio" | "document">,
      command: commandValue,
      args,
      cwd: flags.cwd,
      env,
      outputExtension: flags.ext,
      mimeType: flags["mime-type"],
    });
    if (wantsJson) {
      writeJson(context.stdout, backend);
    } else {
      context.stdout.write(`${backend.id}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "generations" && command === "remove-backend") {
    const id = flags.id;
    if (!id) {
      context.stderr.write("--id is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const removed = claw.generations.removeBackend(id);
    if (wantsJson) {
      writeJson(context.stdout, { removed, id });
    } else {
      context.stdout.write(`${removed}\n`);
    }
    return removed ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
  }

  if (group === "generations" && command === "create") {
    const kind = (flags.kind as "image" | "video" | "audio" | "document" | undefined) ?? "image";
    const prompt = flags.prompt;
    if (!prompt) {
      context.stderr.write("--prompt is required\n");
      return CLI_EXIT_USAGE;
    }
    const args = parseJsonFlag<string[]>(flags["args-json"], "--args-json");
    const env = parseJsonFlag<Record<string, string>>(flags["env-json"], "--env-json");
    const metadata = parseJsonFlag<Record<string, unknown>>(flags["metadata-json"], "--metadata-json");
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const record = await claw.generations.create({
      kind,
      prompt,
      title: flags.title,
      backendId: flags.backend,
      model: flags.model,
      metadata,
      command: flags.command,
      args,
      cwd: flags.cwd,
      env,
      outputExtension: flags.ext,
      mimeType: flags["mime-type"],
    });
    if (wantsJson) {
      writeJson(context.stdout, record);
    } else {
      context.stdout.write(`${record.id} ${record.output?.filePath ?? "missing-output"}\n`);
    }
    return record.status === "succeeded" ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
  }

  if (group === "generations" && command === "list") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const records = claw.generations.list({
      ...(flags.kind ? { kind: flags.kind as "image" | "video" | "audio" | "document" } : {}),
      ...(flags.backend ? { backendId: flags.backend } : {}),
      ...(flags.status ? { status: flags.status as "succeeded" | "failed" } : {}),
      ...(flags.limit ? { limit: Number(flags.limit) } : {}),
    });
    if (wantsJson) {
      writeJson(context.stdout, records);
    } else {
      context.stdout.write(`${records.map((record) => `${record.id} ${record.kind} ${record.status} ${record.title}`).join("\n")}\n`);
    }
    return records.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "generations" && command === "read") {
    const id = flags.id;
    if (!id) {
      context.stderr.write("--id is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const record = claw.generations.get(id);
    if (wantsJson) {
      writeJson(context.stdout, record);
    } else {
      context.stdout.write(`${record?.output?.filePath ?? "missing"}\n`);
    }
    return record ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
  }

  if (group === "generations" && command === "delete") {
    const id = flags.id;
    if (!id) {
      context.stderr.write("--id is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const removed = claw.generations.remove(id);
    if (wantsJson) {
      writeJson(context.stdout, { removed, id });
    } else {
      context.stdout.write(`${removed}\n`);
    }
    return removed ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
  }

    context.stderr.write(`${usage}\n`);
    return CLI_EXIT_USAGE;
  }
