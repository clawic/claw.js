import fs from "fs";
import http from "http";
import net from "net";
import os from "os";
import path from "path";
import { spawn, spawnSync } from "child_process";
import { createHash, randomBytes } from "crypto";
import { fileURLToPath } from "url";

import {
  buildCodexCommand,
  buildSetDefaultModelCommand,
  createClaw,
  createLocalStorageStore,
  createStorageHttpHandler,
  createLocalLibraryStore,
  createCodeLedger,
  createCodeGlobalIndex,
  startCodeServer,
  discoverWorkspaces,
  getRuntimeAdapter,
  normalizeLibraryId,
  redactSecrets,
} from "@clawjs/claw";
import { buildDatabaseApp } from "@clawjs/database";
import type { ClawInstance, TelegramSendMediaInput, TelegramSendMessageInput, VoiceNoteStatus } from "@clawjs/claw";
import { createWorkspaceClaw } from "@clawjs/workspace";
import type { WorkspaceClawInstance } from "@clawjs/workspace";
import { clawCommandRequestSchema, clawContractVersionV1, resolveClawPersistentSurfacePath, semanticPlanSchema } from "@clawjs/core";
import type { ClawCommandResponse, ClawDomain, CommitmentKind, CommitmentStatus, ContextPackPurpose, ContextPackStatus, JudgmentImpact, JudgmentStatus, LearningEvidenceSentiment, LearningKind, LearningPromotionTarget, LearningStatus, LearningTarget, MediaDirection, MediaKind, MediaListInput, MediaOrigin, OutcomeResult, OutcomeStatus, RuntimeAdapterId, RulesCompileInput, SemanticPlan, SoulModule, SoulModuleKey, TemporalItem, UserCompileProfile, UserDomainId, UserEntityType, UserFactSensitivity, UserFactValue, UserPackId, UserRecordType } from "@clawjs/core";
import { runEmbeddedDatabaseCli } from "./database-advanced.ts";
import { runMagicDbCli } from "./database-magic.ts";
import { runMemoryCli } from "./memory-local.ts";
import { runChatCli, runProviderCli } from "./chat.ts";
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
import { runSlidesCli } from "./slides.ts";
import { runStyleCli } from "./styles/index.ts";
import { runTemplateCli } from "./templates/index.ts";
import { runReferenceCli } from "./references/index.ts";
import { runV1DataCli } from "./v1-data.ts";
import { activeHost, readHostRegistry, registerHost, resolveHostRegistryFile, useHost } from "./host-registry.ts";
import { HostClientError, sendHostCommand } from "./host-client.ts";
import { CLI_USAGE, DEFAULT_CLI_BIN, PUBLIC_PORTAL_HELP_ONLY, REMOVED_RUNTIME_COMMANDS, REMOVED_V1_CRUD_COMMANDS, buildCliUsage, buildCommandHelp, normalizePublicCliArgv, removedPublicCommandMessage } from "./cli-surface.ts";
import { inferBrokerDeclaredFields } from "./broker-http.ts";
import { runInspectCli } from "./inspect-cli.ts";
import { CLI_TEMPLATE_ROOT, CORE_PRODUCTIVITY_DB_COLLECTIONS, LOCAL_FIRST_PRODUCTIVITY_GROUPS } from "./cli-constants.ts";
import { COMMITMENT_KINDS, COMMITMENT_STATUSES, CONTEXT_PURPOSES, CONTEXT_STATUSES, JUDGMENT_IMPACTS, JUDGMENT_STATUSES, LEARNING_KINDS, LEARNING_PROMOTION_TARGETS, LEARNING_SENTIMENTS, LEARNING_STATUSES, LEARNING_TARGETS, OUTCOME_RESULTS, OUTCOME_STATUSES } from "./cli-knowledge-constants.ts";
import {
  LEGACY_TELEGRAM_CODEX_PROCESSOR_ID,
  TELEGRAM_CODEX_ATTACHMENT_INSTRUCTIONS,
  TELEGRAM_CODEX_BOT_COMMANDS,
  TELEGRAM_CODEX_DEFAULT_INTERVAL_MS,
  TELEGRAM_CODEX_DEFAULT_PROCESSOR_TIMEOUT_MS,
  TELEGRAM_CODEX_DEFAULT_TIMEOUT_SECONDS,
  TELEGRAM_TOPIC_ICON_PRESETS,
  type TelegramTopicIconPreset,
} from "./cli-telegram-codex-constants.ts";
import { parseImageOperation, parseImageProvenance, parseImageType } from "./cli-image-parsers.ts";
import { buildImageCommonInput, buildMediaListInput, buildMediaMetadata } from "./cli-media-utils.ts";
import { OPEN_SURFACES, allOpenSurfaceHostnames, parseClawHostSurface, resolveOpenSurface, surfacePrimaryClawUrl, type OpenSurface, type OpenSurfaceState } from "./cli-open-surfaces.ts";
import { openBrowser, openStateDir, openStatePath, readOpenState, repoRootFromCliPackage, writeOpenState } from "./cli-open-state.ts";
import { CLI_EXIT_DEGRADED, CLI_EXIT_FAILURE, CLI_EXIT_OK, CLI_EXIT_USAGE, CliHandledError } from "./cli-errors.ts";
import { collectFlagValues, parseCsvFlag, parseJsonFlag } from "./cli-flag-parsers.ts";
import { inferAudioExtension, inferMimeTypeFromPath, parseInferenceMessages, pathSafeBasename, readJsonFile, resolveRuntimeAdapterId, timelineRange, type GenerationCliMediaKind } from "./cli-runtime-utils.ts";
import { channelListenerPaths, isProcessRunning, readListenerPid, readTail, waitForListenerPid } from "./cli-channel-listener.ts";
import {
  buildFallbackSemanticPlan,
  createDelegationGraphForPlan,
  evaluatePlanPolicy,
  formatPlan,
  nowIso,
  planId,
  readAgentPlanState,
  statusFromDecision,
  writeAgentPlanState,
  type AgentPlanPolicyRule,
  type AgentPlanRecord,
} from "./cli-agent-plan.ts";
export { CLI_USAGE, DEFAULT_CLI_BIN, buildCliUsage } from "./cli-surface.ts";
export interface CliContext {
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
  cwd: string;
  binName?: string;
  runCommand?: (command: string, args: string[], options: { cwd: string }) => Promise<void>;
}

type CliMediaShare = { id: string; url: string };
type CliTemporalExecution = {
  itemId: string;
  status: string;
  scheduledFor: string;
  output?: string;
};
type CliMediaClaw = ClawInstance & {
  media: {
    register(input: { name?: string; mimeType?: string; kind?: MediaKind; filePath?: string; sourceText?: string; origin?: MediaOrigin; direction?: MediaDirection; agentId?: string; workspaceId?: string; projectId?: string; metadata?: Record<string, unknown> }): { mediaId: string; kind: string; name: string };
    list(input?: MediaListInput): Array<{ mediaId: string; kind: string; name: string }>;
    search(input: MediaListInput & { query: string }): Array<{ mediaId: string; kind: string; name: string }>;
    get(mediaId: string): { name: string } | null;
    download(mediaId: string): { media: { name: string }; buffer: Buffer } | null;
    share: {
      create(input: { mediaId?: string; label?: string; filters?: MediaListInput; expiresAt?: string | null; ttlMs?: number }): Promise<CliMediaShare>;
      list(): CliMediaShare[];
      revoke(id: string): Promise<boolean>;
      resolveGallery(id: string): { items: Array<{ mediaId: string; name: string }> } | null;
    };
  };
};

const CLAW_DOMAINS_BEGIN = "# BEGIN CLAWJS DOMAINS";
const CLAW_DOMAINS_END = "# END CLAWJS DOMAINS";
const CLAW_DOMAINS_LABEL = "com.claw.domains";
const CLAW_DOMAINS_SERVICE_DIR = "/Library/Application Support/ClawJS/domains";

interface ClawDomainsStatus {
  installed: boolean;
  hostsConfigured: boolean;
  proxyConfigured: boolean;
  proxyReachable: boolean;
  hosts: string[];
  hostsFile: string;
  plistFile: string;
  proxyUrl: string;
}

function isClawDomainConfigured(flags: Record<string, string>): boolean {
  if (process.env.CLAW_DOMAINS_ACTIVE === "1") return true;
  if (process.env.CLAW_DOMAINS_ACTIVE === "0") return false;
  const hostsFile = flags["domains-hosts-file"] || flags["hosts-file"] || "/etc/hosts";
  try {
    const content = fs.readFileSync(hostsFile, "utf8");
    return content.includes(CLAW_DOMAINS_BEGIN) && content.includes(CLAW_DOMAINS_END);
  } catch {
    return false;
  }
}

function domainHostsBlock(): string {
  return [
    CLAW_DOMAINS_BEGIN,
    `127.0.0.1 ${allOpenSurfaceHostnames().join(" ")}`,
    CLAW_DOMAINS_END,
  ].join("\n");
}

function replaceDomainHostsBlock(current: string, nextBlock: string | null): string {
  const pattern = new RegExp(`${CLAW_DOMAINS_BEGIN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${CLAW_DOMAINS_END.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\n?`, "m");
  const without = current.replace(pattern, "").replace(/\n{3,}/g, "\n\n").trimEnd();
  if (!nextBlock) return without ? `${without}\n` : "";
  return `${without ? `${without}\n\n` : ""}${nextBlock}\n`;
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function domainsPlistPath(flags: Record<string, string>): string {
  return flags["plist-file"] || `/Library/LaunchDaemons/${CLAW_DOMAINS_LABEL}.plist`;
}

function domainsHostsFile(flags: Record<string, string>): string {
  return flags["hosts-file"] || "/etc/hosts";
}

function domainsServiceDir(flags: Record<string, string>): string {
  return flags["service-dir"] || CLAW_DOMAINS_SERVICE_DIR;
}

function domainsProxyScriptPath(flags: Record<string, string>): string {
  return path.join(domainsServiceDir(flags), "proxy.mjs");
}

function domainsProxyConfigPath(flags: Record<string, string>): string {
  return path.join(domainsServiceDir(flags), "config.json");
}

function buildDomainsPlist(flags: Record<string, string>): string {
  const args = [
    process.execPath,
    domainsProxyScriptPath(flags),
    "--config",
    domainsProxyConfigPath(flags),
  ];
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">`,
    `<plist version="1.0">`,
    `<dict>`,
    `  <key>Label</key>`,
    `  <string>${CLAW_DOMAINS_LABEL}</string>`,
    `  <key>ProgramArguments</key>`,
    `  <array>`,
    ...args.map((arg) => `    <string>${xmlEscape(arg)}</string>`),
    `  </array>`,
    `  <key>WorkingDirectory</key>`,
    `  <string>${xmlEscape(domainsServiceDir(flags))}</string>`,
    `  <key>RunAtLoad</key>`,
    `  <true/>`,
    `  <key>KeepAlive</key>`,
    `  <true/>`,
    `  <key>StandardOutPath</key>`,
    `  <string>/tmp/clawjs-domains.out.log</string>`,
    `  <key>StandardErrorPath</key>`,
    `  <string>/tmp/clawjs-domains.err.log</string>`,
    `</dict>`,
    `</plist>`,
    "",
  ].join("\n");
}

function domainsInstallPlan(flags: Record<string, string>) {
  const hostsFile = domainsHostsFile(flags);
  const plistFile = domainsPlistPath(flags);
  return {
    hostsFile,
    plistFile,
    hosts: allOpenSurfaceHostnames(),
    proxyUrl: `http://${flags.host || "127.0.0.1"}:${flags.port || "80"}`,
    serviceLabel: CLAW_DOMAINS_LABEL,
  };
}

function buildDomainsServiceConfig(flags: Record<string, string>, cwd: string): string {
  const user = os.userInfo();
  return `${JSON.stringify({
    host: flags.host || "127.0.0.1",
    port: Number(flags.port || "80"),
    workspace: path.resolve(cwd, flags.workspace ?? "."),
    repoRoot: repoRootFromCliPackage(),
    cliEntryPath: currentCliEntryPath(),
    nodePath: process.execPath,
    username: user.username,
    uid: typeof process.getuid === "function" ? process.getuid() : user.uid,
    homeDir: user.homedir,
    surfacePorts: parseSurfacePortOverrides(flags["surface-port"]),
    surfaces: OPEN_SURFACES.map((surface) => ({
      id: surface.id,
      label: surface.label,
      port: surface.port,
      aliases: surface.aliases ?? [],
    })),
  }, null, 2)}\n`;
}

function buildDomainsProxyScript(): string {
  return `import http from "node:http";
import net from "node:net";
import fs from "node:fs";
import { spawnSync } from "node:child_process";

const configPath = process.argv[process.argv.indexOf("--config") + 1];
if (!configPath) throw new Error("Missing --config");
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const surfaces = config.surfaces;
const byName = new Map();
for (const surface of surfaces) {
  byName.set(surface.id, surface);
  for (const alias of surface.aliases || []) byName.set(alias, surface);
}

function surfacePort(surface) {
  return config.surfacePorts?.[surface.id] || surface.port;
}

function parseSurface(hostHeader) {
  const host = String(hostHeader || "").split(":")[0].trim().toLowerCase();
  if (!host.endsWith(".claw")) return null;
  return byName.get(host.slice(0, -".claw".length)) || null;
}

function indexHtml() {
  const links = surfaces.map((surface) => '<a class="surface" href="http://' + surface.id + '.claw"><span>' + surface.label + '</span><code>' + surface.id + '.claw</code></a>').join("");
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Claw domains</title><style>:root{color-scheme:light dark;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}body{margin:0;min-height:100vh;background:#f7f8fb;color:#16181d}main{max-width:960px;margin:0 auto;padding:48px 24px}h1{margin:0 0 8px;font-size:32px;letter-spacing:0}p{margin:0 0 28px;color:#5f6573}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}.surface{display:flex;flex-direction:column;gap:6px;padding:14px 16px;border:1px solid #dde1e8;border-radius:8px;background:#fff;color:inherit;text-decoration:none}.surface:hover{border-color:#9aa4b5}.surface span{font-weight:650}code{color:#315b9f;font-size:13px;overflow-wrap:anywhere}@media (prefers-color-scheme:dark){body{background:#111318;color:#f2f4f8}p{color:#a6adbb}.surface{background:#191c23;border-color:#303642}.surface:hover{border-color:#687386}code{color:#8bb6ff}}</style></head><body><main><h1>Claw domains</h1><p>Local dashboards available on this machine.</p><section class="grid">' + links + '</section></main></body></html>';
}

async function probe(url) {
  try {
    const response = await fetch(url, { method: "GET" });
    return response.status < 500;
  } catch {
    return false;
  }
}

async function ensureSurface(surface) {
  const target = "http://127.0.0.1:" + surfacePort(surface);
  if (await probe(target)) return target;
  const openArgs = [
    config.cliEntryPath,
    "open",
    surface.id,
    "--host",
    "127.0.0.1",
    "--port",
    String(surfacePort(surface)),
    "--workspace",
    config.workspace,
    "--domains-hosts-file",
    "/tmp/clawjs-domains-disabled-hosts",
    "--no-browser",
    "--json",
  ];
  const envArgs = [
    "HOME=" + config.homeDir,
    "USER=" + config.username,
    "LOGNAME=" + config.username,
    "PATH=/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin",
    "CLAW_DOMAINS_ACTIVE=0",
  ];
  const command = process.platform === "darwin"
    ? ["/bin/launchctl", ["asuser", String(config.uid), "/usr/bin/sudo", "-u", config.username, "/usr/bin/env", ...envArgs, config.nodePath, ...openArgs]]
    : [config.nodePath, openArgs];
  const result = spawnSync(command[0], command[1], { cwd: "/", encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stdout || result.stderr || "Failed to start " + surface.id);
  return target;
}

async function proxy(request, response, targetBase) {
  const incoming = new URL(request.url || "/", "http://127.0.0.1");
  const target = new URL(targetBase);
  target.pathname = incoming.pathname;
  target.search = incoming.search;
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (key.toLowerCase() === "host" || value === undefined) continue;
    if (Array.isArray(value)) for (const item of value) headers.append(key, item);
    else headers.set(key, value);
  }
  const body = request.method === "GET" || request.method === "HEAD" ? undefined : request;
  const upstream = await fetch(target, {
    method: request.method,
    headers,
    body,
    redirect: "manual",
    duplex: body ? "half" : undefined,
  });
  response.statusCode = upstream.status;
  upstream.headers.forEach((value, key) => {
    if (key.toLowerCase() !== "content-encoding") response.setHeader(key, value);
  });
  if (!upstream.body) {
    response.end();
    return;
  }
  const reader = upstream.body.getReader();
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    response.write(Buffer.from(chunk.value));
  }
  response.end();
}

const server = http.createServer((request, response) => {
  void (async () => {
    const surface = parseSurface(request.headers.host);
    if (!surface) {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(indexHtml());
      return;
    }
    await proxy(request, response, await ensureSurface(surface));
  })().catch((error) => {
    response.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
    response.end(error instanceof Error ? error.message : "Domain proxy failed.");
  });
});

server.listen(config.port, config.host);
`;
}

function sudoScript(script: string): void {
  const result = spawnSync("sudo", [
    ...(process.stdin.isTTY ? [] : ["-n"]),
    "sh",
    "-c",
    script,
  ], { stdio: "inherit" });
  if (result.status !== 0) {
    throw new CliHandledError("domains_install_failed", "Failed to update local .claw domain configuration.");
  }
}

function appleScriptQuote(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`;
}

function runPrivilegedScript(script: string, flags: Record<string, string>): void {
  if (process.platform !== "darwin" || flags.auth === "sudo" || flags["no-gui"]) {
    sudoScript(script);
    return;
  }
  const helperPath = path.join(os.tmpdir(), `clawjs-domains-privileged-${process.pid}.sh`);
  fs.writeFileSync(helperPath, `#!/bin/sh\nset -eu\n${script}\n`, { mode: 0o700 });
  const result = spawnSync("osascript", [
    "-e",
    `do shell script ${appleScriptQuote(`/bin/sh ${shellQuote(helperPath)}`)} with administrator privileges`,
  ], {
    encoding: "utf8",
  });
  fs.rmSync(helperPath, { force: true });
  if (result.status !== 0) {
    const message = (result.stderr || result.stdout || "").trim();
    throw new CliHandledError("domains_install_failed", message || "Failed to update local .claw domain configuration.");
  }
}

async function readDomainsStatus(flags: Record<string, string>): Promise<ClawDomainsStatus> {
  const plan = domainsInstallPlan(flags);
  let hostsConfigured = false;
  try {
    const content = fs.readFileSync(plan.hostsFile, "utf8");
    hostsConfigured = content.includes(CLAW_DOMAINS_BEGIN) && content.includes(CLAW_DOMAINS_END);
  } catch {
    hostsConfigured = false;
  }
  const proxyConfigured = fs.existsSync(plan.plistFile);
  const proxyReachable = await portIsOpen(flags.host || "127.0.0.1", Number(flags.port || "80"));
  return {
    installed: hostsConfigured && proxyConfigured,
    hostsConfigured,
    proxyConfigured,
    proxyReachable,
    hosts: plan.hosts,
    hostsFile: plan.hostsFile,
    plistFile: plan.plistFile,
    proxyUrl: plan.proxyUrl,
  };
}

function parseSurfacePortOverrides(value: string | undefined): Record<string, number> {
  const ports: Record<string, number> = {};
  for (const entry of parseCsvFlag(value)) {
    const [name, rawPort] = entry.split("=");
    const surface = resolveOpenSurface(name);
    const port = Number(rawPort);
    if (!surface || !Number.isInteger(port) || port <= 0 || port > 65_535) {
      throw new CliHandledError("usage_error", `Invalid --surface-port entry "${entry}". Use surface=port.`, CLI_EXIT_USAGE);
    }
    ports[surface.id] = port;
  }
  return ports;
}

function surfaceTargetPort(surface: OpenSurface, flags: Record<string, string>): number {
  return parseSurfacePortOverrides(flags["surface-port"])[surface.id] ?? surface.port;
}

async function proxyHttpResponse(input: {
  request: http.IncomingMessage;
  response: http.ServerResponse;
  targetUrl: URL;
}): Promise<void> {
  const incomingUrl = new URL(input.request.url || "/", "http://127.0.0.1");
  const target = new URL(input.targetUrl.toString());
  target.pathname = incomingUrl.pathname;
  target.search = incomingUrl.search;
  const headers = new Headers();
  for (const [key, value] of Object.entries(input.request.headers)) {
    if (key.toLowerCase() === "host" || value === undefined) continue;
    if (Array.isArray(value)) {
      for (const entry of value) headers.append(key, entry);
    } else {
      headers.set(key, value);
    }
  }
  const body = input.request.method === "GET" || input.request.method === "HEAD"
    ? undefined
    : input.request as unknown as BodyInit;
  try {
    const upstream = await fetch(target, {
      method: input.request.method,
      headers,
      body,
      redirect: "manual",
      duplex: body ? "half" : undefined,
    } as RequestInit & { duplex?: "half" });
    input.response.statusCode = upstream.status;
    upstream.headers.forEach((value, key) => {
      if (key.toLowerCase() !== "content-encoding") input.response.setHeader(key, value);
    });
    if (!upstream.body) {
      input.response.end();
      return;
    }
    const reader = upstream.body.getReader();
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      input.response.write(Buffer.from(chunk.value));
    }
    input.response.end();
  } catch (error) {
    input.response.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
    input.response.end(error instanceof Error ? error.message : "Domain proxy failed.");
  }
}

function domainIndexHtml(): string {
  const links = OPEN_SURFACES.map((surface) => `<a class="surface" href="${surfacePrimaryClawUrl(surface)}"><span>${surface.label}</span><code>${surface.id}.claw</code></a>`).join("");
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Claw domains</title>
  <style>
    :root { color-scheme: light dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; min-height: 100vh; background: #f7f8fb; color: #16181d; }
    main { max-width: 960px; margin: 0 auto; padding: 48px 24px; }
    h1 { margin: 0 0 8px; font-size: 32px; letter-spacing: 0; }
    p { margin: 0 0 28px; color: #5f6573; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; }
    .surface { display: flex; flex-direction: column; gap: 6px; padding: 14px 16px; border: 1px solid #dde1e8; border-radius: 8px; background: #fff; color: inherit; text-decoration: none; }
    .surface:hover { border-color: #9aa4b5; }
    .surface span { font-weight: 650; }
    code { color: #315b9f; font-size: 13px; overflow-wrap: anywhere; }
    @media (prefers-color-scheme: dark) {
      body { background: #111318; color: #f2f4f8; }
      p { color: #a6adbb; }
      .surface { background: #191c23; border-color: #303642; }
      .surface:hover { border-color: #687386; }
      code { color: #8bb6ff; }
    }
  </style>
</head>
<body>
  <main>
    <h1>Claw domains</h1>
    <p>Local dashboards available on this machine.</p>
    <section class="grid">${links}</section>
  </main>
</body>
</html>`;
}

async function ensureDomainSurfaceRunning(surface: OpenSurface, flags: Record<string, string>, workspace: string): Promise<URL> {
  const port = surfaceTargetPort(surface, flags);
  const targetUrl = new URL(`http://127.0.0.1:${port}`);
  if (await probeHttpServer(targetUrl)) return targetUrl;
  if (flags["no-auto-start"] !== undefined || flags["auto-start"] === "false") return targetUrl;
  const result = spawnSync(process.execPath, [
    currentCliEntryPath(),
    "open",
    surface.id,
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--workspace",
    workspace,
    "--domains-hosts-file",
    path.join(os.tmpdir(), "clawjs-domains-disabled-hosts"),
    "--no-browser",
    "--json",
  ], {
    cwd: repoRootFromCliPackage(),
    encoding: "utf8",
    env: {
      ...process.env,
      CLAW_DOMAINS_ACTIVE: "0",
    },
  });
  if (result.status !== 0) {
    throw new CliHandledError("domain_surface_start_failed", result.stdout || result.stderr || `Failed to start ${surface.id}.`);
  }
  return targetUrl;
}

function writeJson(stream: NodeJS.WritableStream, payload: unknown): void {
  stream.write(`${JSON.stringify(redactSecrets(payload), null, 2)}\n`);
}

function writeJsonLine(stream: NodeJS.WritableStream, payload: unknown): void {
  stream.write(`${JSON.stringify(redactSecrets(payload))}\n`);
}

function writeCliError(stream: NodeJS.WritableStream, error: unknown): void {
  const handled = error instanceof CliHandledError
    ? error
    : new CliHandledError("internal_error", error instanceof Error ? error.message : String(error));
  writeJson(stream, {
    ok: false,
    error: {
      code: handled.code,
      message: handled.message,
    },
  });
}
function cliErrorFromUnknown(error: unknown): CliHandledError {
  return error instanceof CliHandledError
    ? error
    : new CliHandledError("internal_error", error instanceof Error ? error.message : String(error));
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

function parseRuleHints(flags: Record<string, string>): Omit<RulesCompileInput, "prompt"> | undefined {
  const hints: Omit<RulesCompileInput, "prompt"> = {
    ...(flags.user ? { user: flags.user } : {}),
    ...(flags.organization || flags.org ? { organization: flags.organization || flags.org } : {}),
    ...(flags.brand ? { brand: flags.brand } : {}),
    ...(flags.client ? { client: flags.client } : {}),
    ...(flags.project ? { project: flags.project } : {}),
    ...(flags.domain ? { domain: flags.domain } : {}),
    ...(flags.service ? { service: flags.service } : {}),
    ...(flags["task-type"] || flags.task ? { taskType: flags["task-type"] || flags.task } : {}),
    ...(flags["output-format"] || flags.output ? { outputFormat: flags["output-format"] || flags.output } : {}),
    ...(flags.agent ? { agent: flags.agent } : {}),
    ...(flags.channel ? { channel: flags.channel } : {}),
    ...(flags["rules-limit"] ? { limit: Number(flags["rules-limit"]) } : {}),
  };
  return Object.keys(hints).length > 0 ? hints : undefined;
}

function parseRuleReferences(value: string | undefined): Array<{ kind: string; ref: string; label?: string }> {
  return parseCsvFlag(value).map((entry) => {
    const [kind, ref, label] = entry.split(":");
    if (!kind || !ref) {
      throw new CliHandledError("usage_error", `Invalid rule reference "${entry}". Use kind:ref[:label].`, CLI_EXIT_USAGE);
    }
    return {
      kind,
      ref,
      ...(label ? { label } : {}),
    };
  });
}

function writeProgress(stream: NodeJS.WritableStream, event: { phase: string; status: string; percent?: number; message?: string }): void {
  const suffix = typeof event.percent === "number" ? ` ${event.percent}%` : "";
  const message = event.message ? ` ${event.message}` : "";
  stream.write(`${event.phase} ${event.status}${suffix}${message}\n`);
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function portIsOpen(host: string, port: number): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    const socket = net.createConnection({ host, port });
    socket.setTimeout(500);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => resolve(false));
  });
}

async function waitForUrl(url: string, timeoutMs = 15_000): Promise<boolean> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { method: "GET" });
      if (response.status < 500) return true;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return false;
}

function buildOpenUsage(binName: string): string {
  const rows = OPEN_SURFACES.map((surface) => `  ${surface.id.padEnd(12)} http://127.0.0.1:${surface.port}`).join("\n");
  return [
    `Usage: ${binName} open <surface> [--no-browser] [--host HOST] [--port PORT]`,
    "",
    "Available dashboards:",
    rows,
  ].join("\n");
}

function openSurfaceRows(flags: Record<string, string> = {}): Array<Record<string, string>> {
  const useClawDomains = isClawDomainConfigured(flags);
  return OPEN_SURFACES.map((surface) => ({
    surface: surface.id,
    url: useClawDomains ? surfacePrimaryClawUrl(surface) : `http://127.0.0.1:${surface.port}`,
    aliases: (surface.aliases ?? []).join(","),
  }));
}

function ensureSurfaceBuild(surface: OpenSurface): void {
  if (!surface.dir || !surface.buildCheck) return;
  const repoRoot = repoRootFromCliPackage();
  const surfaceDir = path.join(repoRoot, surface.dir);
  if (!fs.existsSync(surfaceDir)) {
    throw new CliHandledError("dashboard_unavailable", `${surface.id} dashboard is not available in this installation.`);
  }
  if (fs.existsSync(path.join(surfaceDir, surface.buildCheck))) return;
  if (fs.existsSync(path.join(surfaceDir, "package.json")) && !fs.existsSync(path.join(surfaceDir, "node_modules"))) {
    const install = spawnSync("npm", ["--prefix", surfaceDir, "install"], {
      cwd: repoRoot,
      stdio: "ignore",
      env: {
        ...process.env,
        npm_config_audit: "false",
        npm_config_fund: "false",
      },
    });
    if (install.status !== 0) {
      throw new CliHandledError("dashboard_install_failed", `Failed to install ${surface.id} dashboard dependencies.`);
    }
  }
  const result = spawnSync("npm", ["--prefix", surfaceDir, "run", "build"], {
    cwd: repoRoot,
    stdio: "ignore",
    env: {
      ...process.env,
      npm_config_audit: "false",
      npm_config_fund: "false",
    },
  });
  if (result.status !== 0) {
    throw new CliHandledError("dashboard_build_failed", `Failed to build ${surface.id} dashboard.`);
  }
}

function prepareOpenSurface(surface: OpenSurface, workspace: string): void {
  if (surface.kind !== "memory") return;
  if (fs.existsSync(path.join(workspace, ".memory"))) return;
  const repoRoot = repoRootFromCliPackage();
  const memoryCli = path.join(repoRoot, "memory", "dist", "cli.js");
  const result = spawnSync(process.execPath, [memoryCli, "init", "--dir", workspace], {
    cwd: workspace,
    stdio: "ignore",
    env: process.env,
  });
  if (result.status !== 0) {
    throw new CliHandledError("dashboard_prepare_failed", "Failed to initialize memory dashboard workspace.");
  }
}

function cliBinPath(): string {
  const currentArgv = process.argv[1];
  if (currentArgv && fs.existsSync(currentArgv)) return currentArgv;
  const packagedBin = fileURLToPath(new URL("../bin/claw.mjs", import.meta.url));
  if (fs.existsSync(packagedBin)) return packagedBin;
  return fileURLToPath(import.meta.url);
}

function buildSurfaceCommand(surface: OpenSurface, input: { host: string; port: number; workspace: string }): { command: string; args: string[]; cwd: string; env: NodeJS.ProcessEnv } {
  const repoRoot = repoRootFromCliPackage();
  const surfaceDir = surface.dir ? path.join(repoRoot, surface.dir) : repoRoot;
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (surface.envHost) env[surface.envHost] = input.host;
  if (surface.envPort) env[surface.envPort] = String(input.port);

  if (surface.kind === "internal-database" || surface.kind === "internal-storage") {
    return {
      command: process.execPath,
      args: [
        cliBinPath(),
        "__open-server",
        surface.id,
        "--host",
        input.host,
        "--port",
        String(input.port),
        "--workspace",
        input.workspace,
      ],
      cwd: repoRoot,
      env,
    };
  }

  if (surface.kind === "memory") {
    return {
      command: process.execPath,
      args: [path.join(surfaceDir, "dist", "cli.js"), "serve", "--port", String(input.port)],
      cwd: input.workspace,
      env,
    };
  }

  if (surface.kind === "cli-serve") {
    return {
      command: process.execPath,
      args: [path.join(surfaceDir, "dist", "cli.js"), "serve", "--host", input.host, "--port", String(input.port)],
      cwd: surfaceDir,
      env,
    };
  }

  if (surface.kind === "server-script") {
    return {
      command: process.execPath,
      args: [path.join(surfaceDir, surface.script ?? "dist/server.js")],
      cwd: surfaceDir,
      env,
    };
  }

  if (surface.kind === "agenda") {
    return {
      command: process.execPath,
      args: [path.join(surfaceDir, "dist", "serve-dashboard.js"), "--port", String(input.port), "--root", input.workspace],
      cwd: surfaceDir,
      env,
    };
  }

  return {
    command: "npm",
    args: ["--prefix", surfaceDir, "exec", "--", "next", "start", "--hostname", input.host, "--port", String(input.port)],
    cwd: surfaceDir,
    env,
  };
}

async function runOpenCli(input: {
  argv: string[];
  positionals: string[];
  flags: Record<string, string>;
  context: CliContext;
  wantsJson: boolean;
  binName: string;
}): Promise<number> {
  const surfaceName = input.positionals[1];
  if (!surfaceName || surfaceName === "list") {
    if (input.wantsJson) {
      writeJson(input.context.stdout, { dashboards: openSurfaceRows(input.flags) });
    } else {
      input.context.stdout.write(`${formatCliTable(openSurfaceRows(input.flags))}\n`);
    }
    return CLI_EXIT_OK;
  }
  if (surfaceName === "help" || input.argv.includes("--help") || input.argv.includes("-h")) {
    input.context.stdout.write(`${buildOpenUsage(input.binName)}\n`);
    return CLI_EXIT_OK;
  }

  const surface = resolveOpenSurface(surfaceName);
  if (!surface) {
    throw new CliHandledError("unknown_dashboard", `Unknown dashboard: ${surfaceName}`, CLI_EXIT_USAGE);
  }

  const host = input.flags.host ?? "127.0.0.1";
  const port = input.flags.port ? Number(input.flags.port) : surface.port;
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new CliHandledError("invalid_port", `Invalid port: ${input.flags.port}`, CLI_EXIT_USAGE);
  }

  const workspace = path.resolve(input.context.cwd, input.flags.workspace ?? ".");
  const directUrl = `http://${host}:${port}`;
  const useClawDomain = isClawDomainConfigured(input.flags) && host === "127.0.0.1" && port === surface.port;
  const url = useClawDomain ? surfacePrimaryClawUrl(surface) : directUrl;
  const statePath = openStatePath(surface.id, host, port);
  const state = readOpenState(statePath);
  if (state && state.surface === surface.id && state.host === host && state.port === port && processIsAlive(state.pid)) {
    if (await waitForUrl(state.targetUrl || state.url, 1_000)) {
      const outputUrl = useClawDomain ? surfacePrimaryClawUrl(surface) : state.url;
      if (!input.argv.includes("--no-browser") && !readBooleanFlag(input.argv, input.flags, "no-browser", false)) openBrowser(outputUrl);
      if (input.wantsJson) writeJson(input.context.stdout, { ok: true, reused: true, surface: surface.id, url: outputUrl, pid: state.pid });
      else input.context.stdout.write(`${outputUrl}\n`);
      return CLI_EXIT_OK;
    }
  }
  if (state) {
    fs.rmSync(statePath, { force: true });
  }

  if (await portIsOpen(host, port)) {
    throw new CliHandledError("port_in_use", `${directUrl} is already in use. Use --port to choose another port.`);
  }

  ensureSurfaceBuild(surface);
  prepareOpenSurface(surface, workspace);
  const command = buildSurfaceCommand(surface, { host, port, workspace });
  const child = spawn(command.command, command.args, {
    cwd: command.cwd,
    env: command.env,
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  if (!child.pid) {
    throw new CliHandledError("dashboard_start_failed", `Failed to start ${surface.id} dashboard.`);
  }

  const nextState: OpenSurfaceState = {
    surface: surface.id,
    pid: child.pid,
    host,
    port,
    url,
    targetUrl: directUrl,
    workspace,
    startedAt: new Date().toISOString(),
  };
  writeOpenState(statePath, nextState);

  const ready = await waitForUrl(directUrl);
  if (!ready) {
    throw new CliHandledError("dashboard_start_timeout", `${surface.id} dashboard did not become ready at ${directUrl}.`);
  }

  const browserUrl = surface.id === "storage" && fs.existsSync(path.join(openStateDir(), `storage-token-${host}-${port}.txt`))
    ? `${url}?token=${encodeURIComponent(fs.readFileSync(path.join(openStateDir(), `storage-token-${host}-${port}.txt`), "utf8").trim())}&bucket=workspace`
    : url;
  if (!input.argv.includes("--no-browser") && !readBooleanFlag(input.argv, input.flags, "no-browser", false)) openBrowser(browserUrl);
  if (input.wantsJson) writeJson(input.context.stdout, { ok: true, reused: false, surface: surface.id, url, pid: child.pid });
  else input.context.stdout.write(`${url}\n`);
  return CLI_EXIT_OK;
}

function sendStaticFile(response: http.ServerResponse, filePath: string): void {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = ext === ".html" ? "text/html; charset=utf-8"
    : ext === ".js" ? "text/javascript; charset=utf-8"
      : ext === ".css" ? "text/css; charset=utf-8"
        : ext === ".svg" ? "image/svg+xml"
          : "application/octet-stream";
  response.writeHead(200, { "content-type": contentType });
  response.end(fs.readFileSync(filePath));
}

async function runOpenServerCommand(input: { positionals: string[]; flags: Record<string, string>; context: CliContext }): Promise<number> {
  const surface = resolveOpenSurface(input.positionals[1]);
  if (!surface) throw new CliHandledError("unknown_dashboard", `Unknown dashboard: ${input.positionals[1]}`, CLI_EXIT_USAGE);
  const host = input.flags.host ?? "127.0.0.1";
  const port = input.flags.port ? Number(input.flags.port) : surface.port;
  const workspace = path.resolve(input.context.cwd, input.flags.workspace ?? ".");

  if (surface.kind === "internal-database") {
    const { app } = buildDatabaseApp({
      config: {
        host,
        port,
        dataDir: resolveClawPersistentSurfacePath("claw.workspace.dashboard_database", workspace),
      },
    });
    await app.listen({ host, port });
    await new Promise(() => undefined);
    return CLI_EXIT_OK;
  }

  if (surface.kind === "internal-storage") {
    const store = createLocalStorageStore({
      workspaceDir: workspace,
      agentId: "dashboard-storage",
      grants: [{
        bucket: "workspace",
        operations: ["objects:list", "objects:read", "objects:write", "objects:delete", "shares:create", "shares:revoke"],
      }],
    });
    const issued = store.issueToken({
      label: "storage dashboard",
      grants: [{
        bucket: "workspace",
        operations: ["objects:list", "objects:read", "objects:write", "objects:delete", "shares:create", "shares:revoke"],
      }],
    });
    fs.mkdirSync(openStateDir(), { recursive: true });
    fs.writeFileSync(path.join(openStateDir(), `storage-token-${host}-${port}.txt`), `${issued.token}\n`);
    const storageHandler = createStorageHttpHandler({ store });
    const uiRoot = path.join(repoRootFromCliPackage(), "storage", "ui", "dist");
    const server = http.createServer(async (request, response) => {
      const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? host}`);
      if (requestUrl.pathname.startsWith("/v1/storage/") || requestUrl.pathname.startsWith("/shared/storage/")) {
        await storageHandler(request, response);
        return;
      }
      const normalized = path.normalize(decodeURIComponent(requestUrl.pathname)).replace(/^(\.\.[/\\])+/, "");
      const candidate = path.join(uiRoot, normalized === "/" ? "index.html" : normalized);
      const filePath = candidate.startsWith(uiRoot) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()
        ? candidate
        : path.join(uiRoot, "index.html");
      sendStaticFile(response, filePath);
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, host, () => {
        server.off("error", reject);
        resolve();
      });
    });
    await new Promise(() => undefined);
    return CLI_EXIT_OK;
  }

  throw new CliHandledError("invalid_dashboard_server", `${surface.id} is not an internal open server.`);
}

async function runDomainsCli(input: {
  argv: string[];
  positionals: string[];
  flags: Record<string, string>;
  context: CliContext;
  wantsJson: boolean;
  binName: string;
}): Promise<number> {
  const command = input.positionals[1] || "status";
  const dryRun = input.argv.includes("--dry-run");
  if (command === "status") {
    const status = await readDomainsStatus(input.flags);
    if (input.wantsJson) writeJson(input.context.stdout, status);
    else input.context.stdout.write(`installed=${status.installed} proxy=${status.proxyReachable ? "running" : "stopped"}\n`);
    return CLI_EXIT_OK;
  }

  if (command === "install") {
    const plan = domainsInstallPlan(input.flags);
    const plist = buildDomainsPlist(input.flags);
    const serviceConfig = buildDomainsServiceConfig(input.flags, input.context.cwd);
    const proxyScript = buildDomainsProxyScript();
    if (dryRun) {
      if (input.wantsJson) writeJson(input.context.stdout, { ok: true, dryRun: true, action: "install", ...plan, hostsBlock: domainHostsBlock(), plist, serviceConfig });
      else input.context.stdout.write(`install ${plan.hosts.length} hosts and ${plan.serviceLabel}\n`);
      return CLI_EXIT_OK;
    }
    const currentHosts = fs.existsSync(plan.hostsFile) ? fs.readFileSync(plan.hostsFile, "utf8") : "";
    const nextHosts = replaceDomainHostsBlock(currentHosts, domainHostsBlock());
    if (input.flags["hosts-file"] || input.flags["plist-file"]) {
      fs.mkdirSync(path.dirname(plan.hostsFile), { recursive: true });
      fs.writeFileSync(plan.hostsFile, nextHosts);
      fs.mkdirSync(path.dirname(plan.plistFile), { recursive: true });
      fs.writeFileSync(plan.plistFile, plist);
      fs.mkdirSync(domainsServiceDir(input.flags), { recursive: true });
      fs.writeFileSync(domainsProxyScriptPath(input.flags), proxyScript);
      fs.writeFileSync(domainsProxyConfigPath(input.flags), serviceConfig);
    } else {
      const tempHosts = path.join(os.tmpdir(), `clawjs-domains-hosts-${process.pid}`);
      const tempPlist = path.join(os.tmpdir(), `clawjs-domains-${process.pid}.plist`);
      const tempProxy = path.join(os.tmpdir(), `clawjs-domains-proxy-${process.pid}.mjs`);
      const tempConfig = path.join(os.tmpdir(), `clawjs-domains-config-${process.pid}.json`);
      fs.writeFileSync(tempHosts, nextHosts);
      fs.writeFileSync(tempPlist, plist);
      fs.writeFileSync(tempProxy, proxyScript);
      fs.writeFileSync(tempConfig, serviceConfig);
      runPrivilegedScript([
        `cp ${shellQuote(tempHosts)} ${shellQuote(plan.hostsFile)}`,
        `mkdir -p ${shellQuote(domainsServiceDir(input.flags))}`,
        `cp ${shellQuote(tempProxy)} ${shellQuote(domainsProxyScriptPath(input.flags))}`,
        `cp ${shellQuote(tempConfig)} ${shellQuote(domainsProxyConfigPath(input.flags))}`,
        `chown -R root:wheel ${shellQuote(domainsServiceDir(input.flags))}`,
        `chmod 755 ${shellQuote(domainsServiceDir(input.flags))}`,
        `chmod 644 ${shellQuote(domainsProxyScriptPath(input.flags))} ${shellQuote(domainsProxyConfigPath(input.flags))}`,
        `cp ${shellQuote(tempPlist)} ${shellQuote(plan.plistFile)}`,
        `chown root:wheel ${shellQuote(plan.plistFile)}`,
        `chmod 644 ${shellQuote(plan.plistFile)}`,
        `launchctl bootout system/${CLAW_DOMAINS_LABEL} >/dev/null 2>&1 || true`,
        `launchctl bootstrap system ${shellQuote(plan.plistFile)}`,
        `launchctl enable system/${CLAW_DOMAINS_LABEL}`,
        `launchctl kickstart -k system/${CLAW_DOMAINS_LABEL}`,
      ].join("\n"), input.flags);
      fs.rmSync(tempHosts, { force: true });
      fs.rmSync(tempPlist, { force: true });
      fs.rmSync(tempProxy, { force: true });
      fs.rmSync(tempConfig, { force: true });
    }
    if (input.wantsJson) writeJson(input.context.stdout, { ok: true, action: "install", ...plan });
    else input.context.stdout.write("installed\n");
    return CLI_EXIT_OK;
  }

  if (command === "uninstall") {
    const plan = domainsInstallPlan(input.flags);
    if (dryRun) {
      if (input.wantsJson) writeJson(input.context.stdout, { ok: true, dryRun: true, action: "uninstall", ...plan });
      else input.context.stdout.write(`uninstall ${plan.serviceLabel}\n`);
      return CLI_EXIT_OK;
    }
    const currentHosts = fs.existsSync(plan.hostsFile) ? fs.readFileSync(plan.hostsFile, "utf8") : "";
    const nextHosts = replaceDomainHostsBlock(currentHosts, null);
    if (input.flags["hosts-file"] || input.flags["plist-file"]) {
      fs.mkdirSync(path.dirname(plan.hostsFile), { recursive: true });
      fs.writeFileSync(plan.hostsFile, nextHosts);
      fs.rmSync(plan.plistFile, { force: true });
      fs.rmSync(domainsServiceDir(input.flags), { force: true, recursive: true });
    } else {
      const tempHosts = path.join(os.tmpdir(), `clawjs-domains-hosts-${process.pid}`);
      fs.writeFileSync(tempHosts, nextHosts);
      runPrivilegedScript([
        `launchctl bootout system/${CLAW_DOMAINS_LABEL} >/dev/null 2>&1 || true`,
        `cp ${shellQuote(tempHosts)} ${shellQuote(plan.hostsFile)}`,
        `rm -f ${shellQuote(plan.plistFile)}`,
        `rm -rf ${shellQuote(domainsServiceDir(input.flags))}`,
      ].join("\n"), input.flags);
      fs.rmSync(tempHosts, { force: true });
    }
    if (input.wantsJson) writeJson(input.context.stdout, { ok: true, action: "uninstall", ...plan });
    else input.context.stdout.write("uninstalled\n");
    return CLI_EXIT_OK;
  }

  if (command === "serve") {
    const host = input.flags.host || "127.0.0.1";
    const port = Number(input.flags.port || "80");
    if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
      throw new CliHandledError("invalid_port", `Invalid port: ${input.flags.port}`, CLI_EXIT_USAGE);
    }
    const workspace = path.resolve(input.context.cwd, input.flags.workspace ?? ".");
    const server = http.createServer((request, response) => {
      void (async () => {
        const surface = parseClawHostSurface(request.headers.host);
        if (!surface) {
          response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
          response.end(domainIndexHtml());
          return;
        }
        const targetUrl = await ensureDomainSurfaceRunning(surface, input.flags, workspace);
        await proxyHttpResponse({ request, response, targetUrl });
      })().catch((error) => {
        response.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
        response.end(error instanceof Error ? error.message : "Domain proxy failed.");
      });
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, host, () => resolve());
    });
    if (input.wantsJson) writeJsonLine(input.context.stdout, { ok: true, url: `http://${host}:${port}`, hosts: allOpenSurfaceHostnames() });
    else input.context.stdout.write(`http://${host}:${port}\n`);
    await new Promise<void>((resolve) => {
      const shutdown = () => server.close(() => resolve());
      process.once("SIGINT", shutdown);
      process.once("SIGTERM", shutdown);
    });
    return CLI_EXIT_OK;
  }

  input.context.stderr.write(`Usage: ${input.binName} domains install|status|uninstall|serve\n`);
  return CLI_EXIT_USAGE;
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

function joinedPositionals(positionals: string[], startIndex: number): string | undefined {
  const value = positionals.slice(startIndex).join(" ").trim();
  return value || undefined;
}

function formatCliTable(rows: Array<Record<string, string>>): string {
  if (rows.length === 0) return "";
  const columns = Object.keys(rows[0] ?? {});
  const widths = Object.fromEntries(columns.map((column) => [
    column,
    Math.max(column.length, ...rows.map((row) => (row[column] ?? "").length)),
  ]));
  return [
    columns.map((column) => column.padEnd(widths[column])).join("  "),
    columns.map((column) => "-".repeat(widths[column])).join("  "),
    ...rows.map((row) => columns.map((column) => (row[column] ?? "").padEnd(widths[column])).join("  ")),
  ].join("\n");
}

function hostRegistryOptions(flags: Record<string, string>): { clawHome?: string } {
  return flags["claw-home"] ? { clawHome: path.resolve(flags["claw-home"]) } : {};
}

async function runHostCli(input: {
  argv: string[];
  positionals: string[];
  flags: Record<string, string>;
  context: CliContext;
  wantsJson: boolean;
  binName: string;
}): Promise<number> {
  const [, command, hostIdArg] = input.positionals;
  const options = hostRegistryOptions(input.flags);

  if (command === "domains") {
    return await runDomainsCli({
      argv: ["domains", ...input.argv.slice(2)],
      positionals: ["domains", ...input.positionals.slice(2)],
      flags: input.flags,
      context: input.context,
      wantsJson: input.wantsJson,
      binName: input.binName,
    });
  }

  if (command === "list" || !command) {
    const registry = readHostRegistry(options);
    if (input.wantsJson) {
      writeJson(input.context.stdout, { ...registry, registryPath: resolveHostRegistryFile(options) });
    } else {
      const rows = registry.hosts.map((host) => ({
        active: registry.activeHostId === host.id ? "*" : "",
        id: host.id,
        name: host.displayName,
        kind: host.kind,
        transport: host.endpoint?.transport ?? "-",
      }));
      input.context.stdout.write(rows.length ? `${formatCliTable(rows)}\n` : "No hosts registered.\n");
    }
    return CLI_EXIT_OK;
  }

  if (command === "register") {
    const id = input.flags.id ?? hostIdArg;
    const displayName = input.flags.name ?? input.flags["display-name"];
    const kind = input.flags.kind ?? "standalone";
    if (!id || !displayName) {
      throw new CliHandledError("usage_error", `Usage: ${input.binName} host register <id> --name NAME [--kind standalone|embedded|third_party] [--transport xpc --address NAME] [--use]`, CLI_EXIT_USAGE);
    }
    if (kind !== "standalone" && kind !== "embedded" && kind !== "third_party") {
      throw new CliHandledError("usage_error", "Host kind must be standalone, embedded, or third_party.", CLI_EXIT_USAGE);
    }
    const transport = input.flags.transport;
    const address = input.flags.address;
    if ((transport && !address) || (!transport && address)) {
      throw new CliHandledError("usage_error", "--transport and --address must be provided together.", CLI_EXIT_USAGE);
    }
    if (transport && transport !== "xpc" && transport !== "unix_socket" && transport !== "http" && transport !== "stdio") {
      throw new CliHandledError("usage_error", "Host transport must be xpc, unix_socket, http, or stdio.", CLI_EXIT_USAGE);
    }
    const endpoint = transport && address
      ? { transport: transport as "xpc" | "unix_socket" | "http" | "stdio", address }
      : undefined;
    const registry = registerHost({
      id,
      displayName,
      kind,
      ...(input.flags["bundle-id"] ? { bundleId: input.flags["bundle-id"] } : {}),
      ...(input.flags.executable ? { executablePath: path.resolve(input.flags.executable) } : {}),
      ...(input.flags["app-support-dir"] ? { appSupportDir: path.resolve(input.flags["app-support-dir"]) } : {}),
      ...(endpoint ? { endpoint } : {}),
    }, options, input.argv.includes("--use"));
    const host = registry.hosts.find((entry) => entry.id === id);
    if (input.wantsJson) writeJson(input.context.stdout, { ok: true, host, registryPath: resolveHostRegistryFile(options), activeHostId: registry.activeHostId });
    else input.context.stdout.write(`registered ${id}${registry.activeHostId === id ? " and set active" : ""}\n`);
    return CLI_EXIT_OK;
  }

  if (command === "use") {
    const hostId = hostIdArg ?? input.flags.id;
    if (!hostId) throw new CliHandledError("usage_error", `Usage: ${input.binName} host use <id>`, CLI_EXIT_USAGE);
    const registry = useHost(hostId, options);
    if (input.wantsJson) writeJson(input.context.stdout, { ok: true, activeHostId: registry.activeHostId, registryPath: resolveHostRegistryFile(options) });
    else input.context.stdout.write(`active host: ${registry.activeHostId}\n`);
    return CLI_EXIT_OK;
  }

  if (command === "status" || command === "doctor") {
    const registry = readHostRegistry(options);
    const host = hostIdArg ? registry.hosts.find((entry) => entry.id === hostIdArg) ?? null : activeHost(registry);
    const ok = !!host;
    if (input.wantsJson) {
      writeJson(input.context.stdout, {
        ok,
        activeHostId: registry.activeHostId,
        host,
        registryPath: resolveHostRegistryFile(options),
        error: ok ? undefined : { code: "host_unavailable", message: hostIdArg ? `Host not registered: ${hostIdArg}` : "No active host configured." },
      });
    } else if (host) {
      input.context.stdout.write(`host: ${host.id}\nname: ${host.displayName}\nkind: ${host.kind}\ntransport: ${host.endpoint?.transport ?? "not configured"}\n`);
    } else {
      input.context.stderr.write(hostIdArg ? `Host not registered: ${hostIdArg}\n` : "No active host configured.\n");
    }
    return ok ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  input.context.stderr.write(`Usage: ${input.binName} host list|register|use|status\n`);
  return CLI_EXIT_USAGE;
}

const HOST_FORWARD_DOMAINS = new Set<ClawDomain>([
  "agents",
  "skills",
  "design",
  "sessions",
  "projects",
  "memory",
  "files",
  "productivity",
  "calendar",
  "contacts",
  "reminders",
  "mail",
  "notes",
  "messages",
  "browser",
  "terminal",
  "voice",
  "models",
  "services",
  "database",
  "integrations",
  "system",
  "secrets",
  "mini_apps",
]);

const DEFAULT_HOST_RESOURCES: Partial<Record<ClawDomain, string>> = {
  agents: "agents",
  skills: "skills",
  design: "design",
  sessions: "sessions",
  projects: "projects",
  memory: "notes",
  files: "entries",
  productivity: "items",
  calendar: "events",
  contacts: "contacts",
  reminders: "items",
  mail: "messages",
  notes: "notes",
  messages: "conversations",
  browser: "sessions",
  terminal: "sessions",
  voice: "transcripts",
  models: "models",
  services: "services",
  database: "records",
  integrations: "integrations",
  secrets: "secrets",
  mini_apps: "apps",
};

function requestId(prefix: string): string {
  return `${prefix}-${randomBytes(8).toString("hex")}`;
}

function hostForwardArguments(flags: Record<string, string>): Record<string, unknown> {
  const skipped = new Set(["json", "claw-home", "host", "host-id"]);
  return Object.fromEntries(Object.entries(flags).filter(([key]) => !skipped.has(key)));
}

async function runSystemCapabilitiesCli(input: {
  positionals: string[];
  flags: Record<string, string>;
  context: CliContext;
  wantsJson: boolean;
  binName: string;
}): Promise<number> {
  const [, resource, action = "list"] = input.positionals;
  if (resource !== "capabilities") return CLI_EXIT_USAGE;
  if (!["list", "grant", "revoke"].includes(action)) {
    throw new CliHandledError("usage_error", `Usage: ${input.binName} system capabilities list|grant|revoke [scope]`, CLI_EXIT_USAGE);
  }
  return runHostForwardCli({
    domain: "system",
    resource: "capabilities",
    action,
    flags: input.flags,
    context: input.context,
    wantsJson: input.wantsJson,
    extraArguments: {
      ...(input.positionals[3] ? { scope: input.positionals[3] } : {}),
    },
  });
}

async function runDirectHostDomainCli(input: {
  positionals: string[];
  flags: Record<string, string>;
  context: CliContext;
  wantsJson: boolean;
}): Promise<number> {
  const [group, command, subcommand] = input.positionals;
  const domain = group as ClawDomain;
  const resource = subcommand ? command : DEFAULT_HOST_RESOURCES[domain];
  const action = subcommand ?? command ?? "list";
  if (!resource || !action) return CLI_EXIT_USAGE;
  return runHostForwardCli({
    domain,
    resource,
    action,
    flags: input.flags,
    context: input.context,
    wantsJson: input.wantsJson,
  });
}

async function runHostForwardCli(input: {
  domain: ClawDomain;
  resource: string;
  action: string;
  flags: Record<string, string>;
  context: CliContext;
  wantsJson: boolean;
  extraArguments?: Record<string, unknown>;
}): Promise<number> {
  const registry = readHostRegistry(hostRegistryOptions(input.flags));
  const requestedHostId = input.flags.host ?? input.flags["host-id"];
  const host = requestedHostId
    ? registry.hosts.find((entry) => entry.id === requestedHostId) ?? null
    : activeHost(registry);
  if (!host) {
    throw new CliHandledError(
      "host_unavailable",
      requestedHostId
        ? `Host not registered: ${requestedHostId}.`
        : "No active host configured. Run `claw host register ... --use` or start Clawix/Claw.app first.",
      CLI_EXIT_DEGRADED,
    );
  }

  const request = clawCommandRequestSchema.parse({
    schemaVersion: clawContractVersionV1,
    requestId: requestId(`${input.domain}-${input.action}`),
    domain: input.domain,
    resource: input.resource,
    action: input.action,
    arguments: {
      ...hostForwardArguments(input.flags),
      ...(input.extraArguments ?? {}),
    },
    clientContext: {
      pid: process.pid,
      executablePath: process.argv[1] ?? "claw",
      tty: Boolean(process.stdout.isTTY),
    },
    validationMode: input.flags["validation-mode"] ?? "host_real",
  });

  try {
    const response = await sendHostCommand(host, request);
    writeHostResponse(input.context, response, input.wantsJson);
    return response.ok ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
  } catch (error) {
    if (error instanceof HostClientError) {
      throw new CliHandledError(error.code, error.message, error.code === "host_transport_unsupported" ? CLI_EXIT_USAGE : CLI_EXIT_DEGRADED);
    }
    throw error;
  }
}

function writeHostResponse(context: CliContext, response: ClawCommandResponse, wantsJson: boolean): void {
  if (wantsJson) {
    writeJson(context.stdout, response);
    return;
  }
  if (!response.ok) {
    context.stderr.write(`${response.error?.message ?? "Host command failed."}\n`);
    return;
  }
  if (response.data === undefined) {
    context.stdout.write("ok\n");
  } else if (typeof response.data === "string") {
    context.stdout.write(`${response.data}\n`);
  } else {
    writeJson(context.stdout, response.data);
  }
}

function temporalNext(item: TemporalItem): string {
  return item.nextRunAt ?? item.startsAt ?? item.dueAt ?? "";
}

function writeTemporalItems(
  stream: NodeJS.WritableStream,
  items: TemporalItem[],
  options: { empty?: string } = {},
): void {
  if (items.length === 0) {
    stream.write(`${options.empty ?? "No items"}\n`);
    return;
  }
  stream.write(`${formatCliTable(items.map((item) => ({
    id: item.id,
    status: item.status,
    next: temporalNext(item),
    title: item.title,
  })))}\n`);
}

function writeTemporalExecutions(stream: NodeJS.WritableStream, executions: CliTemporalExecution[]): void {
  if (executions.length === 0) {
    stream.write("No runs\n");
    return;
  }
  stream.write(`${formatCliTable(executions.map((execution) => ({
    id: execution.itemId,
    status: execution.status,
    next: execution.scheduledFor,
    title: execution.output ?? "",
  })))}\n`);
}

function parseWatchTarget(value: string): { anchorType: NonNullable<TemporalItem["anchorType"]>; anchorId: string } {
  const separatorIndex = value.indexOf(":");
  const anchorType = separatorIndex === -1 ? "standalone" : value.slice(0, separatorIndex);
  const anchorId = separatorIndex === -1 ? value : value.slice(separatorIndex + 1);
  if (!["thread", "task", "project", "goal", "event", "execution", "standalone"].includes(anchorType) || !anchorId.trim()) {
    throw new CliHandledError("usage_error", `Invalid watch target "${value}". Use values like thread:123.`, CLI_EXIT_USAGE);
  }
  return {
    anchorType: anchorType as NonNullable<TemporalItem["anchorType"]>,
    anchorId: anchorId.trim(),
  };
}

function parseLooseCliValue(rawValue: string): unknown {
  if (!rawValue.length) return "";
  if ((rawValue.startsWith("{") && rawValue.endsWith("}")) || (rawValue.startsWith("[") && rawValue.endsWith("]"))) {
    try {
      return JSON.parse(rawValue) as unknown;
    } catch {
      return rawValue;
    }
  }
  if (rawValue === "true") return true;
  if (rawValue === "false") return false;
  if (rawValue === "null") return null;
  if (/^-?\d+(\.\d+)?$/.test(rawValue)) return Number(rawValue);
  return rawValue;
}

function parseSetFlags(argv: string[]): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== "--set") continue;
    const pair = argv[index + 1];
    if (!pair || pair.startsWith("--")) {
      throw new CliHandledError("usage_error", "--set requires key=value", CLI_EXIT_USAGE);
    }
    const equalsIndex = pair.indexOf("=");
    if (equalsIndex <= 0) {
      throw new CliHandledError("usage_error", "--set requires key=value", CLI_EXIT_USAGE);
    }
    values[pair.slice(0, equalsIndex)] = parseLooseCliValue(pair.slice(equalsIndex + 1));
    index += 1;
  }
  return values;
}

const SOUL_CLI_MODULES = new Set<SoulModuleKey>([
  "identity",
  "mission",
  "values",
  "temperament",
  "communication",
  "cognition",
  "autonomy",
  "memory",
  "boundaries",
  "tools",
  "social",
  "domain",
  "operations",
  "vibe",
]);

function parseSoulModulesFromSetFlags(argv: string[]): Partial<Record<SoulModuleKey, SoulModule>> {
  const values = parseSetFlags(argv);
  const modules: Partial<Record<SoulModuleKey, SoulModule>> = {};
  for (const [pathKey, value] of Object.entries(values)) {
    const [moduleKey, settingKey] = pathKey.split(".", 2);
    if (!moduleKey || !settingKey || !SOUL_CLI_MODULES.has(moduleKey as SoulModuleKey)) {
      throw new CliHandledError("usage_error", `Soul --set keys must use module.setting, received ${pathKey}`, CLI_EXIT_USAGE);
    }
    const key = moduleKey as SoulModuleKey;
    modules[key] = {
      ...(modules[key] ?? {}),
      [settingKey]: value,
    } as SoulModule;
  }
  return modules;
}

function parseSkillScopeFlag(value: string): { kind: "global" | "project" | "tag" | "chat"; projectIds?: string[]; chatId?: string; tagFilters?: string[] } {
  if (!value || value === "global") return { kind: "global" };
  const [kindRaw, ref] = value.split(":", 2);
  const kind = kindRaw as "global" | "project" | "tag" | "chat";
  if (kind === "project") return { kind, projectIds: ref ? ref.split(",").map((s) => s.trim()).filter(Boolean) : [] };
  if (kind === "chat") return { kind, chatId: ref ?? "" };
  if (kind === "tag") return { kind, tagFilters: ref ? ref.split(",").map((s) => s.trim()).filter(Boolean) : [] };
  return { kind: "global" };
}

function parseSkillParamsFlag(value: string | undefined): Record<string, unknown> {
  if (!value) return {};
  const out: Record<string, unknown> = {};
  for (const pair of value.split(",")) {
    const [k, v] = pair.split("=", 2);
    if (!k) continue;
    out[k.trim()] = v ?? "";
  }
  return out;
}

async function readAllStdin(stdin: NodeJS.ReadableStream): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    let acc = "";
    stdin.setEncoding?.("utf8");
    stdin.on("data", (chunk: string | Buffer) => {
      acc += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    });
    stdin.on("end", () => resolve(acc));
    stdin.on("error", (err) => reject(err));
  });
}

function parseUserFactValue(raw: string | undefined, label: string): UserFactValue {
  if (raw === undefined) throw new CliHandledError("usage_error", `${label} is required`, CLI_EXIT_USAGE);
  const parsed = parseLooseCliValue(raw);
  if (
    typeof parsed === "string"
    || typeof parsed === "number"
    || typeof parsed === "boolean"
    || parsed === null
    || Array.isArray(parsed)
    || (typeof parsed === "object" && parsed !== null)
  ) {
    return parsed as UserFactValue;
  }
  return String(parsed);
}

function parseUserFieldsFromSetFlags(argv: string[]): Record<string, UserFactValue> {
  return parseSetFlags(argv) as Record<string, UserFactValue>;
}

function parseUserMetadataFlags(flags: Record<string, string>) {
  return {
    ...(flags.domain ? { domain: flags.domain as UserDomainId } : {}),
    ...(flags.supersedes ? { supersedes: flags.supersedes } : {}),
    ...(flags.source ? { source: flags.source } : {}),
    ...(flags.sensitivity ? { sensitivity: flags.sensitivity as UserFactSensitivity } : {}),
    ...(flags.confidence ? { confidence: Number(flags.confidence) } : {}),
    ...(flags["valid-from"] ? { validFrom: flags["valid-from"] } : {}),
    ...(flags["valid-to"] ? { validTo: flags["valid-to"] } : {}),
    ...(flags.notes ? { notes: flags.notes } : {}),
    ...(flags.visibility ? { visibility: flags.visibility as "agent" | "public" | "private" } : {}),
  };
}

function parseObjectFlag(value: string | undefined, label: string): Record<string, unknown> {
  if (!value?.trim()) return {};
  const parsed = parseJsonFlag<unknown>(value, label);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new CliHandledError("invalid_json", `${label} must be a JSON object.`);
  }
  return parsed as Record<string, unknown>;
}

function coreProductivityCollection(rawCollection: string | undefined): string | null {
  if (!rawCollection) return null;
  return CORE_PRODUCTIVITY_DB_COLLECTIONS[rawCollection.trim().toLowerCase()] ?? null;
}

function singularCoreCollection(collectionName: string): string {
  if (collectionName === "people") return "person";
  if (collectionName.endsWith("s")) return collectionName.slice(0, -1);
  return collectionName;
}

function pickCoreTitle(collectionName: string, payload: Record<string, unknown>, fallback?: string): string | undefined {
  const primary = collectionName === "people" ? "displayName" : ["projects", "cycles", "saved_views", "custom_fields", "templates"].includes(collectionName) ? "name" : collectionName === "field_values" ? "fieldId" : collectionName === "comments" ? "body" : "title";
  const value = payload[primary] ?? payload.title ?? payload.name ?? payload.displayName ?? fallback;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parseSimpleDurationMs(value: string | undefined): number | null {
  const match = value?.trim().match(/^(\d+)(ms|s|m|h|d)$/);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isSafeInteger(amount) || amount <= 0) return null;
  const unit = match[2];
  if (unit === "ms") return amount;
  if (unit === "s") return amount * 1000;
  if (unit === "m") return amount * 60 * 1000;
  if (unit === "h") return amount * 60 * 60 * 1000;
  return amount * 24 * 60 * 60 * 1000;
}

function parseRoutineStaggerMs(flags: Record<string, string>, argv: string[]): number | undefined {
  const hasExact = argv.includes("--exact");
  const raw = flags.stagger;
  if (hasExact && raw) {
    throw new CliHandledError("usage_error", "Choose --stagger or --exact, not both.", CLI_EXIT_USAGE);
  }
  if (hasExact) return 0;
  if (!raw) return undefined;
  const parsed = parseSimpleDurationMs(raw);
  if (parsed === null) {
    throw new CliHandledError("invalid_duration", `Unsupported stagger "${raw}". Use durations like 30s, 5m, or 1h.`, CLI_EXIT_USAGE);
  }
  return parsed;
}

function parseActiveHours(raw: string | undefined, timezone: string | undefined): NonNullable<NonNullable<TemporalItem["heartbeat"]>["activeHours"]> | undefined {
  if (!raw) return undefined;
  const match = raw.trim().match(/^(\d{2}:\d{2})-(\d{2}:\d{2})$/);
  if (!match) {
    throw new CliHandledError("usage_error", 'Invalid --active-hours. Use "09:00-18:00".', CLI_EXIT_USAGE);
  }
  return {
    start: match[1]!,
    end: match[2]!,
    timezone: timezone || "UTC",
  };
}

function parseHeartbeatGate(pathValue: string | undefined): NonNullable<TemporalItem["heartbeat"]>["gate"] | undefined {
  if (!pathValue) return undefined;
  const gatePath = path.resolve(pathValue);
  const policy = JSON.parse(fs.readFileSync(gatePath, "utf8")) as Record<string, unknown>;
  return { path: gatePath, policy };
}

function buildRoutineHeartbeat(argv: string[], flags: Record<string, string>): Partial<NonNullable<TemporalItem["heartbeat"]>> | undefined {
  const when = collectFlagValues(argv, "when");
  const stopWhen = collectFlagValues(argv, "stop-when");
  const allowedCustomChecks = collectFlagValues(argv, "allow-custom-check");
  const gate = parseHeartbeatGate(flags.gate);
  const cooldownMs = flags.cooldown ? parseSimpleDurationMs(flags.cooldown) : undefined;
  if (flags.cooldown && cooldownMs === null) {
    throw new CliHandledError("invalid_duration", `Unsupported cooldown "${flags.cooldown}". Use durations like 30s, 5m, or 1h.`, CLI_EXIT_USAGE);
  }
  const maxWakes = flags["max-wakes"] ? Number(flags["max-wakes"]) : undefined;
  const maxWakesWindowMs = flags["max-wakes-window"] ? parseSimpleDurationMs(flags["max-wakes-window"]) : undefined;
  if (flags["max-wakes"] && (!Number.isSafeInteger(maxWakes) || Number(maxWakes) <= 0)) {
    throw new CliHandledError("usage_error", "--max-wakes must be a positive integer.", CLI_EXIT_USAGE);
  }
  if (flags["max-wakes-window"] && maxWakesWindowMs === null) {
    throw new CliHandledError("invalid_duration", `Unsupported max wake window "${flags["max-wakes-window"]}".`, CLI_EXIT_USAGE);
  }
  if ((maxWakes && !maxWakesWindowMs) || (!maxWakes && maxWakesWindowMs)) {
    throw new CliHandledError("usage_error", "Use --max-wakes and --max-wakes-window together.", CLI_EXIT_USAGE);
  }
  const activeHours = parseActiveHours(flags["active-hours"], flags["active-timezone"]);
  const target = flags.target as "main" | "isolated" | undefined;
  if (target && target !== "main" && target !== "isolated") {
    throw new CliHandledError("usage_error", "--target must be main or isolated.", CLI_EXIT_USAGE);
  }
  const deliver = flags.deliver ? { target: flags.deliver, mode: "summary" as const } : undefined;
  if (when.length === 0 && stopWhen.length === 0 && !gate && !flags.prompt && !activeHours && cooldownMs === undefined && !maxWakes && !target && !deliver) return undefined;
  const missingCustomChecks = [...when, ...stopWhen]
    .filter((condition) => condition.startsWith("custom:"))
    .map((condition) => condition.slice("custom:".length).trim())
    .filter((id) => id && !allowedCustomChecks.includes(id));
  if (missingCustomChecks.length > 0) {
    throw new CliHandledError("usage_error", `Custom heartbeat checks require --allow-custom-check: ${[...new Set(missingCustomChecks)].join(", ")}`, CLI_EXIT_USAGE);
  }
  return {
    when,
    ...(stopWhen.length > 0 ? { stopWhen } : {}),
    context: "diff",
    limit: flags.limit ? Number(flags.limit) : 20,
    ...(target ? { target } : {}),
    ...(deliver ? { deliver } : {}),
    ...(activeHours ? { activeHours } : {}),
    ...(cooldownMs !== undefined && cooldownMs !== null ? { cooldownMs } : {}),
    ...(maxWakes && maxWakesWindowMs ? { maxWakesPerWindow: { count: maxWakes, windowMs: maxWakesWindowMs } } : {}),
    ...(flags.prompt ? { prompt: flags.prompt } : {}),
    ...(gate ? { gate } : {}),
    ...(allowedCustomChecks.length > 0 ? { allowedCustomChecks } : {}),
  };
}

const LOCAL_CLI_ALLOWED_FLAGS = new Set([
  "json",
  "workspace",
  "workspace-id",
  "agent-id",
  "app-id",
  "runtime",
  "runtime-workspace",
  "agent-dir",
  "home-dir",
  "config-path",
  "auth-store",
  "gateway-url",
  "gateway-token",
  "gateway-port",
  "gateway-config",
  "template-pack",
  "time-url",
  "time-token",
  "timezone",
  "url",
  "token",
  "namespace",
  "id",
  "data",
  "set",
  "limit",
  "include-archived",
  "include-completed",
  "include-done",
  "force",
  "cascade",
  "title",
  "name",
  "description",
  "summary",
  "content",
  "status",
  "priority",
  "type",
  "rank",
  "labels",
  "tags",
  "area-id",
  "list-id",
  "section-id",
  "project-id",
  "goal-id",
  "cycle-id",
  "epic-id",
  "owner-person-id",
  "owner-agent-id",
  "lead-agent-id",
  "assignee",
  "watchers",
  "reporter-person-id",
  "start-at",
  "defer-until",
  "due-at",
  "deadline-at",
  "snoozed-until",
  "recurrence-rule",
  "trigger-at",
  "starts-at",
  "ends-at",
  "before",
  "after",
  "end",
  "anchor-at",
  "after-ms",
  "if-no",
  "then",
  "location",
  "attendees",
  "anchor-type",
  "anchor-id",
  "channel",
  "email",
  "phone",
  "handle",
  "external-id",
  "kind",
  "role",
  "organization",
  "query",
  "strategy",
  "domains",
  "domain",
  "blocked",
  "overdue",
  "has-reminder",
  "ids",
  "depends-on",
  "child-task-ids",
  "comment-ids",
  "attachment-ids",
  "checklist-json",
  "estimate-minutes",
  "actual-minutes",
  "story-points",
  "blocked-reason",
  "waiting-on",
  "started-at",
  "completed-at",
  "cancelled-at",
  "event-id",
  "parent-task-id",
  "parent-id",
  "parent-goal-id",
  "company-id",
  "portfolio-id",
  "portfolio-item-id",
  "target-date",
  "start-date",
  "review-at",
  "deadline-at",
  "archive-reason",
  "template-id",
  "status-category",
  "default-section-ids",
  "start",
  "milestone-ids",
  "health-status",
  "level",
  "metric-key",
  "metric-label",
  "target-value",
  "current-value",
  "unit",
  "period",
  "timeframe-start",
  "timeframe-end",
  "review-cadence",
  "metric-direction",
  "upcoming-only",
  "unread-only",
  "thread",
  "subject",
  "participants",
  "task-title",
  "note-title",
  "reminder-title",
  "entity-type",
  "entity-id",
  "task-id",
  "thread-id",
  "decision-id",
  "dependency-task-ids",
  "evidence-ids",
  "artifact-ids",
  "blocker-ids",
  "task-ids",
  "timebox-minutes",
  "objective",
  "outcome",
  "uri",
  "rationale",
  "alternatives",
  "assigned-to-agent-id",
  "assigned-by",
  "assigned-by-agent-id",
  "reviewer-agent-id",
  "from-agent-id",
  "to-agent-id",
  "next-step",
  "due-reason",
  "approver-agent-id",
  "requested-by-agent-id",
  "policy-reason",
  "approval-id",
  "handoff-id",
  "decision-ids",
  "availability",
  "team-id",
  "agent-id",
  "max-wip",
  "current-wip",
  "queue-depth",
  "blocked-count",
  "overdue-count",
  "response-latency-minutes",
  "utilization",
  "assigned-task-ids",
  "pending-approval-ids",
  "pending-handoff-ids",
  "snapshot-at",
  "field-id",
  "field-type",
  "filter",
  "filters",
  "sort",
  "group-by",
  "favorite",
  "rule",
  "next-run-at",
  "last-run-at",
  "starts-at",
  "ends-at",
  "capacity-points",
  "entity-type",
  "entity-id",
  "visibility",
  "author-person-id",
  "author-agent-id",
  "mime-type",
  "size-bytes",
  "preview",
  "uploaded-by",
  "value",
  "required",
  "options",
  "body",
  "path",
  "replace",
]);

function collectFlagNames(argv: string[]): string[] {
  return argv
    .filter((token) => token.startsWith("--"))
    .map((token) => {
      const withoutPrefix = token.slice(2);
      const equalsIndex = withoutPrefix.indexOf("=");
      return equalsIndex === -1 ? withoutPrefix : withoutPrefix.slice(0, equalsIndex);
    });
}

function assertAllowedLocalFlags(group: string | undefined, argv: string[]): void {
  if (!group || (group !== "db" && group !== "export" && group !== "import" && group !== "backup" && group !== "agenda" && group !== "review" && group !== "team-work" && !LOCAL_FIRST_PRODUCTIVITY_GROUPS.has(group))) return;
  for (const flag of collectFlagNames(argv)) {
    if (!LOCAL_CLI_ALLOWED_FLAGS.has(flag)) {
      throw new CliHandledError("usage_error", `Unknown flag --${flag}`, CLI_EXIT_USAGE);
    }
  }
}

function camelCaseFlag(flag: string): string {
  return flag.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

function mergeCoreDbInput(
  action: "create" | "update",
  collectionName: string,
  positionals: string[],
  flags: Record<string, string>,
  argv: string[],
): { recordId?: string; payload: Record<string, unknown> } {
  const reservedFlags = new Set([
    "app-id",
    "workspace",
    "workspace-id",
    "agent-id",
    "runtime",
    "url",
    "token",
    "namespace",
    "json",
    "id",
    "data",
    "set",
    "limit",
    "include-archived",
    "force",
    "cascade",
  ]);
  const payload: Record<string, unknown> = {
    ...parseObjectFlag(flags.data, "--data"),
    ...parseSetFlags(argv),
  };
  for (const [flag, value] of Object.entries(flags)) {
    if (reservedFlags.has(flag)) continue;
    payload[camelCaseFlag(flag)] ??= parseLooseCliValue(value);
  }
  const titleStart = action === "create" ? 3 : 4;
  const fallbackTitle = joinedPositionals(positionals, titleStart);
  const title = pickCoreTitle(collectionName, payload, fallbackTitle);
  if (title) {
    if (collectionName === "people") payload.displayName ??= title;
    else if (["projects", "cycles", "saved_views", "custom_fields", "templates"].includes(collectionName)) payload.name ??= title;
    else if (collectionName === "field_values") payload.fieldId ??= title;
    else if (collectionName === "comments") payload.body ??= title;
    else payload.title ??= title;
  }
  if (typeof payload.labels === "string") payload.labels = parseCsvFlag(payload.labels);
  if (typeof payload.tags === "string") payload.tags = parseCsvFlag(payload.tags);
  if (typeof payload.watchers === "string") payload.watcherPersonIds = parseCsvFlag(payload.watchers);
  if (typeof payload.attendees === "string") payload.attendeePersonIds = parseCsvFlag(payload.attendees);
  if (typeof payload.taskIds === "string") payload.taskIds = parseCsvFlag(payload.taskIds);
  if (typeof payload.commentIds === "string") payload.commentIds = parseCsvFlag(payload.commentIds);
  if (typeof payload.attachmentIds === "string") payload.attachmentIds = parseCsvFlag(payload.attachmentIds);
  if (typeof payload.defaultSectionIds === "string") payload.defaultSectionIds = parseCsvFlag(payload.defaultSectionIds);
  if (typeof payload.email === "string") payload.emails = parseCsvFlag(payload.email);
  if (typeof payload.phone === "string") payload.phones = parseCsvFlag(payload.phone);
  if (typeof payload.handle === "string") payload.handles = parseCsvFlag(payload.handle);
  return action === "create"
    ? { payload }
    : { recordId: positionals[3] || flags.id, payload };
}

type TelegramCodexReplyPolicy = "all" | "mention_or_reply" | "commands";

interface TelegramCodexBridgeState {
  schemaVersion: 1;
  ownerUserId?: string;
  replyPolicy: TelegramCodexReplyPolicy;
  authorizedTargets: Array<{
    provider: string;
    accountId: string;
    targetId: string;
    threadId?: string | number;
    authorizedByUserId: string;
    authorizedAt: string;
  }>;
  sessions: Record<string, string>;
}

interface TelegramCodexProcessorEvent {
  type?: string;
  provider?: string;
  accountId?: string;
  targetId?: string;
  message?: {
    id?: string;
    text?: string;
    targetId?: string;
    threadId?: string | number;
    senderId?: string;
    senderLabel?: string;
    providerMessageId?: string;
    metadata?: Record<string, unknown>;
    raw?: Record<string, unknown>;
  };
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      input += chunk;
    });
    process.stdin.on("error", reject);
    process.stdin.on("end", () => resolve(input));
  });
}

function runForegroundProcess(
  command: string,
  args: string[],
  options: {
    cwd: string;
    env?: NodeJS.ProcessEnv;
    stdout: NodeJS.WritableStream;
    stderr: NodeJS.WritableStream;
  },
): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout?.on("data", (chunk) => options.stdout.write(chunk));
    child.stderr?.on("data", (chunk) => options.stderr.write(chunk));
    child.on("error", (error) => {
      options.stderr.write(`${error.message}\n`);
      resolve(CLI_EXIT_FAILURE);
    });
    child.on("close", (exitCode) => resolve(exitCode ?? CLI_EXIT_FAILURE));
  });
}

function sanitizeStableId(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "default";
}

function hashStableId(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function normalizeTelegramCodexReplyPolicy(value?: string): TelegramCodexReplyPolicy {
  return value === "mention_or_reply" || value === "commands" || value === "all" ? value : "all";
}

function telegramCodexStatePath(workspaceRoot: string, flags: Record<string, string>): string {
  return path.resolve(flags["bridge-state"] || resolveClawPersistentSurfacePath("claw.workspace.telegram_codex_bridge_state", workspaceRoot));
}

const CODEX_AGENT_ID = "codex";
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function currentCliEntryPath(): string {
  const entry = fileURLToPath(import.meta.url);
  const packagedBin = path.resolve(path.dirname(entry), "..", "bin", "claw.mjs");
  return fs.existsSync(packagedBin) ? packagedBin : entry;
}

function maybeRerenderSlidesPdfMedia(media: unknown): string | null {
  if (typeof media !== "string" || !media.endsWith(".pdf") || /^(https?:|file:)/i.test(media)) return null;
  const marker = `${path.sep}.claw${path.sep}slides${path.sep}outputs${path.sep}`;
  const markerIndex = media.indexOf(marker);
  if (markerIndex < 0) return null;
  const workspaceRoot = media.slice(0, markerIndex);
  const [deckId] = media.slice(markerIndex + marker.length).split(path.sep);
  if (!workspaceRoot || !deckId) return null;
  const manifestPath = resolveClawPersistentSurfacePath("claw.workspace.slides", workspaceRoot, "decks", `${deckId}.json`);
  if (!fs.existsSync(manifestPath)) return null;
  let deck: { slides?: Array<{ image?: { src?: string } }>; outputs?: Array<Record<string, unknown>> };
  try {
    deck = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as typeof deck;
  } catch {
    return null;
  }
  if (!deck.slides?.some((slide) => slide.image?.src)) return null;
  const currentOutput = deck.outputs?.find((output) => output.path === media);
  const usedFallback = typeof currentOutput?.metadata === "object"
    && currentOutput.metadata !== null
    && (currentOutput.metadata as { renderer?: unknown }).renderer === "node-fallback";
  if (!usedFallback) return null;

  const result = spawnSync(process.execPath, [
    currentCliEntryPath(),
    "slides",
    "render",
    manifestPath,
    "--workspace",
    workspaceRoot,
    "--format",
    "pdf",
    "--json",
  ], {
    cwd: workspaceRoot,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    env: {
      ...process.env,
      CLAW_SLIDES_DISABLE_BROWSER: "0",
    },
  });
  if (result.status !== 0 || !result.stdout.trim()) return null;
  try {
    const payload = JSON.parse(result.stdout) as { rendered?: Array<{ format?: string; path?: string; metadata?: { renderer?: string } }> };
    const rendered = payload.rendered?.find((output) => output.format === "pdf" && output.path && output.metadata?.renderer !== "node-fallback");
    return rendered?.path && fs.existsSync(rendered.path) ? rendered.path : null;
  } catch {
    return null;
  }
}

function buildTelegramCodexProcessorCommand(input: {
  workspaceRoot: string;
  runtimeAdapterId: RuntimeAdapterId;
  flags: Record<string, string>;
  agentId?: string;
}): string {
  const args = [
    currentCliEntryPath(),
    "channels",
    "codex-processor",
    "run",
    "--runtime",
    input.runtimeAdapterId,
    "--workspace",
    input.workspaceRoot,
    "--runtime-workspace",
    input.flags["runtime-workspace"] || input.workspaceRoot,
    "--bridge-state",
    telegramCodexStatePath(input.workspaceRoot, input.flags),
    "--reply-policy",
    input.flags["reply-policy"] || "all",
    "--agent-id",
    input.agentId || CODEX_AGENT_ID,
  ];
  if (input.flags["home-dir"]) args.push("--home-dir", input.flags["home-dir"]);
  if (input.flags["library-dir"]) args.push("--library-dir", input.flags["library-dir"]);
  if (input.flags["bot-username"]) args.push("--bot-username", input.flags["bot-username"]);
  if (input.flags["system-prompt"]) args.push("--system-prompt", input.flags["system-prompt"]);
  if (input.flags["domain-share-url"]) args.push("--domain-share-url", input.flags["domain-share-url"]);
  if (input.flags["domain-share-ttl"]) args.push("--domain-share-ttl", input.flags["domain-share-ttl"]);
  if (input.flags.transport) args.push("--transport", input.flags.transport);
  if (input.flags.model) args.push("--model", input.flags.model);
  if (input.flags["gateway-retries"]) args.push("--gateway-retries", input.flags["gateway-retries"]);
  if (input.flags["coalescing-window-ms"]) args.push("--coalescing-window-ms", input.flags["coalescing-window-ms"]);
  if (input.flags["compaction-threshold-chars"]) args.push("--compaction-threshold-chars", input.flags["compaction-threshold-chars"]);
  if (input.flags["max-recent-messages"]) args.push("--max-recent-messages", input.flags["max-recent-messages"]);
  return [process.execPath, ...args].map(shellQuote).join(" ");
}

function resolveCodexRuntimeAdapterId(flags: Record<string, string>): RuntimeAdapterId {
  return (flags.runtime?.trim() as RuntimeAdapterId | undefined) || "codex";
}

function registerCodexAgentProcessor(input: {
  claw: Awaited<ReturnType<typeof createCliClaw>>;
  workspaceRoot: string;
  runtimeAdapterId: RuntimeAdapterId;
  flags: Record<string, string>;
  id?: string;
}) {
  const id = input.id || CODEX_AGENT_ID;
  return input.claw.channels.processors.register({
    id,
    label: id === CODEX_AGENT_ID ? "Codex" : "Telegram Codex",
    command: buildTelegramCodexProcessorCommand({
      workspaceRoot: input.workspaceRoot,
      runtimeAdapterId: input.runtimeAdapterId,
      flags: input.flags,
      agentId: id,
    }),
    cwd: input.workspaceRoot,
    agentId: id,
    metadata: {
      kind: "agent",
      agentKind: "codex",
      runtimeAdapter: input.runtimeAdapterId,
    },
  });
}

function appendPromptSection(base: string, section: string): string {
  const trimmedSection = section.trim();
  if (!trimmedSection) return base;
  return `${base.trim()}\n\n${trimmedSection}`;
}

function normalizeTelegramCodexAccount(flags: Record<string, string>): string | undefined {
  return flags.account?.trim() || undefined;
}

function resolveTelegramCodexListenerOptions(flags: Record<string, string>): { intervalMs: number; timeoutSeconds: number; processorTimeoutMs: number } {
  return {
    intervalMs: flags["interval-ms"] ? Number(flags["interval-ms"]) : TELEGRAM_CODEX_DEFAULT_INTERVAL_MS,
    timeoutSeconds: flags.timeout ? Number(flags.timeout) : TELEGRAM_CODEX_DEFAULT_TIMEOUT_SECONDS,
    processorTimeoutMs: flags["processor-timeout-ms"] ? Number(flags["processor-timeout-ms"]) : TELEGRAM_CODEX_DEFAULT_PROCESSOR_TIMEOUT_MS,
  };
}

function readTelegramCodexBridgeState(statePath: string, replyPolicy: TelegramCodexReplyPolicy): TelegramCodexBridgeState {
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, "utf8")) as Partial<TelegramCodexBridgeState>;
    return {
      schemaVersion: 1,
      ...(typeof parsed.ownerUserId === "string" ? { ownerUserId: parsed.ownerUserId } : {}),
      replyPolicy: normalizeTelegramCodexReplyPolicy(parsed.replyPolicy ?? replyPolicy),
      authorizedTargets: Array.isArray(parsed.authorizedTargets) ? parsed.authorizedTargets.filter((entry) => (
        entry
        && typeof entry.provider === "string"
        && typeof entry.accountId === "string"
        && typeof entry.targetId === "string"
        && typeof entry.authorizedByUserId === "string"
        && typeof entry.authorizedAt === "string"
      )) as TelegramCodexBridgeState["authorizedTargets"] : [],
      sessions: parsed.sessions && typeof parsed.sessions === "object" ? parsed.sessions as Record<string, string> : {},
    };
  } catch {
    return {
      schemaVersion: 1,
      replyPolicy,
      authorizedTargets: [],
      sessions: {},
    };
  }
}

function writeTelegramCodexBridgeState(statePath: string, state: TelegramCodexBridgeState): void {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
}

function telegramCodexTargetKey(input: { provider: string; accountId: string; targetId: string; threadId?: string | number }): string {
  return [input.provider, input.accountId, input.targetId, input.threadId ? `topic:${String(input.threadId)}` : "chat"].join(":");
}

function isTelegramPrivateMessage(event: TelegramCodexProcessorEvent): boolean {
  const rawMessage = event.message?.raw?.message as Record<string, unknown> | undefined;
  const chat = rawMessage?.chat as Record<string, unknown> | undefined;
  return chat?.type === "private";
}

function isTelegramReplyToBot(event: TelegramCodexProcessorEvent): boolean {
  const rawMessage = event.message?.raw?.message as Record<string, unknown> | undefined;
  const reply = rawMessage?.reply_to_message as Record<string, unknown> | undefined;
  const from = reply?.from as Record<string, unknown> | undefined;
  return from?.is_bot === true;
}

function shouldReplyToTelegramCodexMessage(
  event: TelegramCodexProcessorEvent,
  policy: TelegramCodexReplyPolicy,
  botUsername?: string,
): boolean {
  if (policy === "all") return true;
  const text = event.message?.text?.trim() ?? "";
  if (text.startsWith("/codex") || text.startsWith("/start") || text.startsWith("/new") || text.startsWith("/reset")) return true;
  if (policy === "commands") return false;
  if (isTelegramReplyToBot(event)) return true;
  return !!(botUsername && text.toLowerCase().includes(`@${botUsername.toLowerCase()}`));
}

type TelegramCodexCommand = "new" | "reset" | "status" | "stop" | "queue" | "continue" | "compact" | "summary" | "debug";

interface TelegramCodexQueuedMessage {
  id: string;
  content: string;
  providerMessageId?: string;
  senderId?: string;
  senderLabel?: string;
  createdAt: number;
  metadata?: Record<string, unknown>;
}

interface TelegramCodexChannelRun {
  runKey: string;
  sessionId: string;
  status: "idle" | "running" | "queued" | "stopping" | "failed";
  queue: TelegramCodexQueuedMessage[];
  summary?: string;
  summaryMessageId?: string;
  activeRunId?: string;
  stopRequestedRunId?: string;
  lastError?: string;
  compactionThresholdChars: number;
  maxRecentMessages: number;
}

type TelegramCodexClaw = ClawInstance & {
  channelRuns: {
    resolveOrCreateChannelRun: (input: {
      provider: string;
      accountId?: string;
      targetId: string;
      threadId?: string | number;
      sessionId: string;
      options?: Record<string, number | undefined>;
    }) => TelegramCodexChannelRun;
    resetChannelRun: (input: {
      provider: string;
      accountId?: string;
      targetId: string;
      threadId?: string | number;
      sessionId: string;
      options?: Record<string, number | undefined>;
    }) => TelegramCodexChannelRun;
    enqueueChannelMessage: (runKey: string, message: Omit<TelegramCodexQueuedMessage, "createdAt"> & { createdAt?: number }) => TelegramCodexChannelRun | null;
    processChannelRun: (input: { runKey: string; sessionId?: string; phase: "start" | "succeed" | "fail"; runId?: string; error?: string }) => TelegramCodexChannelRun | null;
    getChannelRunStatus: (runKey: string) => TelegramCodexChannelRun | null;
    requestChannelRunStop: (runKey: string) => TelegramCodexChannelRun | null;
    compactChannelSession: (input: { runKey: string; sessionId?: string; force?: boolean }) => { run: TelegramCodexChannelRun | null; summary: string; compacted: boolean };
    drainQueuedChannelMessages: (runKey: string) => TelegramCodexQueuedMessage[];
  };
};

function parseTelegramCodexSessionCommand(text: string): { command: TelegramCodexCommand; rest: string } | null {
  const match = text.trim().match(/^\/(new|reset|status|stop|queue|continue|compact|summary|debug)(?:@\w+)?(?:\s+([\s\S]*))?$/i);
  if (!match) return null;
  return {
    command: match[1].toLowerCase() as TelegramCodexCommand,
    rest: (match[2] ?? "").trim(),
  };
}

function stripTelegramCodexCommand(text: string, botUsername?: string): string {
  let next = text.trim();
  next = next.replace(/^\/codex(?:@\w+)?\s*/i, "");
  next = next.replace(/^\/(?:new|reset)(?:@\w+)?\s*/i, "");
  if (botUsername) {
    next = next.replace(new RegExp(`@${botUsername.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "ig"), "").trim();
  }
  return next || text.trim();
}

function resolveTelegramClawDomainRequest(text: string): OpenSurface | null {
  const trimmed = text.trim();
  const openMatch = trimmed.match(/^open\s+([a-z0-9._-]+)(?:\s+dashboard)?$/i);
  if (openMatch) return resolveOpenSurface(openMatch[1]);
  const bareMatch = trimmed.match(/^([a-z0-9._-]+)\.claw$/i);
  if (bareMatch) return resolveOpenSurface(bareMatch[1]);
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname.endsWith(".claw")) return null;
    return resolveOpenSurface(url.hostname.slice(0, -".claw".length));
  } catch {
    return null;
  }
}

function buildTelegramClawDomainReply(surface: OpenSurface, flags: Record<string, string>): string {
  const baseUrl = flags["domain-share-url"] || process.env.CLAW_DOMAIN_SHARE_URL || process.env.CLAW_TELEGRAM_DOMAIN_SHARE_URL;
  const alias = `${surface.id}.claw`;
  if (!baseUrl?.trim()) {
    return `${alias} is local to the ClawJS Mac. Configure a relay/share URL to send a reachable mobile link.`;
  }
  const ttlMs = resolvePreviewShareTtlMs({ ttl: flags["domain-share-ttl"] || "30m" });
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  const share = new URL(baseUrl);
  share.searchParams.set("claw_surface", surface.id);
  share.searchParams.set("claw_target", `http://127.0.0.1:${surface.port}`);
  share.searchParams.set("claw_share_token", randomBytes(18).toString("base64url"));
  share.searchParams.set("expires", expiresAt);
  return `${alias}: ${share.toString()}`;
}

function telegramCodexResetPrompt(command: "new" | "reset"): string {
  return [
    `A new session was started via /${command}.`,
    "Greet the user briefly and ask what they want to do next.",
    `Current time: ${new Date().toISOString()}.`,
  ].join(" ");
}

function formatTelegramCodexQueuedPrompt(messages: Array<{ content: string; senderLabel?: string; createdAt: number }>): string {
  const lines = messages.map((message, index) => {
    const label = message.senderLabel?.trim() || `message ${index + 1}`;
    return `- ${new Date(message.createdAt).toISOString()} ${label}: ${message.content}`;
  });
  return [
    "Messages received while the agent was already working. Treat these as the user's latest steering/follow-up context.",
    ...lines,
  ].join("\n");
}

function formatTelegramCodexStatus(run: TelegramCodexChannelRun | null, sessionId: string): string {
  if (!run) return `Status: idle\nSession: ${sessionId}\nQueue: 0`;
  return [
    `Status: ${run.status}`,
    `Session: ${run.sessionId}`,
    `Queue: ${run.queue.length}`,
    run.summary ? "Summary: available" : "Summary: none",
    run.lastError ? `Last error: ${run.lastError}` : "",
  ].filter(Boolean).join("\n");
}

function buildTelegramCodexEffectiveMessages(
  session: NonNullable<ReturnType<ClawInstance["sessions"]["getSession"]>>,
  options: { summaryMessageId?: string; maxRecentMessages?: number },
) {
  const maxRecentMessages = options.maxRecentMessages ?? 16;
  const summary = options.summaryMessageId
    ? session.messages.find((message) => message.id === options.summaryMessageId)
    : undefined;
  const nonSummary = session.messages.filter((message) => message.metadata?.source !== "channel-run-compaction");
  if (!summary) return nonSummary;
  return [summary, ...nonSummary.slice(-maxRecentMessages)];
}

function formatTelegramCodexPrompt(event: TelegramCodexProcessorEvent, text: string): string {
  const metadata = event.message?.metadata ?? {};
  if (!metadata.voiceNoteId) return text;
  return [
    "The user sent a Telegram voice note. It has already been downloaded and transcribed by ClawJS STT.",
    "Treat the transcript below as the user's actual message. Do not say you cannot hear or access audio.",
    "",
    "Voice note transcript:",
    text,
  ].join("\n");
}

function splitTelegramMessage(text: string, maxLength = 3900): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const chunks: string[] = [];
  let remaining = trimmed;
  while (remaining.length > maxLength) {
    let index = remaining.lastIndexOf("\n", maxLength);
    if (index < Math.floor(maxLength * 0.5)) index = remaining.lastIndexOf(" ", maxLength);
    if (index < Math.floor(maxLength * 0.5)) index = maxLength;
    chunks.push(remaining.slice(0, index).trim());
    remaining = remaining.slice(index).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

type TelegramCodexMediaAction = {
  type: "send_message";
  targetId?: string;
  text?: string;
  media?: string;
  mediaType?: "photo" | "video" | "document" | "audio" | "animation";
  threadId?: string | number;
  parseMode?: "HTML" | "Markdown" | "MarkdownV2";
  metadata?: Record<string, unknown>;
};

function parseTelegramCodexMediaActions(text: string): { text: string; mediaActions: TelegramCodexMediaAction[] } {
  const mediaActions: TelegramCodexMediaAction[] = [];
  const cleaned = text.replace(/```clawjs-telegram-actions\s*([\s\S]*?)```/gi, (_match, rawJson: string) => {
    try {
      const payload = JSON.parse(rawJson.trim()) as unknown;
      const actions = Array.isArray(payload)
        ? payload
        : Array.isArray((payload as { actions?: unknown[] } | null)?.actions)
          ? (payload as { actions: unknown[] }).actions
          : [];
      for (const action of actions) {
        if (!action || typeof action !== "object") continue;
        const candidate = action as Record<string, unknown>;
        const media = typeof candidate.media === "string" ? candidate.media.trim() : "";
        const mediaType = typeof candidate.mediaType === "string" ? candidate.mediaType : "photo";
        if (candidate.type !== "send_message" || !media || !["photo", "video", "document", "audio", "animation"].includes(mediaType)) continue;
        mediaActions.push({
          type: "send_message",
          ...(typeof candidate.targetId === "string" ? { targetId: candidate.targetId } : {}),
          ...(typeof candidate.text === "string" ? { text: candidate.text } : {}),
          media,
          mediaType: mediaType as TelegramCodexMediaAction["mediaType"],
          ...(typeof candidate.threadId === "string" || typeof candidate.threadId === "number" ? { threadId: candidate.threadId } : {}),
          ...(candidate.parseMode === "HTML" || candidate.parseMode === "Markdown" || candidate.parseMode === "MarkdownV2" ? { parseMode: candidate.parseMode } : {}),
          ...(candidate.metadata && typeof candidate.metadata === "object" && !Array.isArray(candidate.metadata) ? { metadata: candidate.metadata as Record<string, unknown> } : {}),
        });
      }
    } catch {
      return _match;
    }
    return "";
  }).trim();
  return { text: cleaned, mediaActions };
}

async function runTelegramCodexProcessor(input: {
  context: CliContext;
  flags: Record<string, string>;
  argv: string[];
  workspaceRoot: string;
  appId: string;
  workspaceId: string;
  agentId: string;
  runtimeAdapterId: RuntimeAdapterId;
}): Promise<number> {
  const raw = await readStdin();
  const event = JSON.parse(raw || "{}") as TelegramCodexProcessorEvent;
  const provider = event.provider || "telegram";
  const accountId = event.accountId || "default";
  const targetId = event.targetId || event.message?.targetId;
  const threadId = event.message?.threadId;
  const senderId = event.message?.senderId;
  const rawText = event.message?.text?.trim();
  if (!targetId || !senderId || !rawText) {
    writeJson(input.context.stdout, { actions: [{ type: "ignore", reason: "missing target, sender, or text" }] });
    return CLI_EXIT_OK;
  }

  const replyPolicy = normalizeTelegramCodexReplyPolicy(input.flags["reply-policy"]);
  const botUsername = input.flags["bot-username"];
  const statePath = telegramCodexStatePath(input.workspaceRoot, input.flags);
  const state = readTelegramCodexBridgeState(statePath, replyPolicy);
  state.replyPolicy = replyPolicy;

  const isPrivate = isTelegramPrivateMessage(event);
  const key = telegramCodexTargetKey({ provider, accountId, targetId, ...(threadId ? { threadId } : {}) });
  const now = new Date().toISOString();
  let changed = false;

  if (!state.ownerUserId) {
    state.ownerUserId = senderId;
    changed = true;
  }

  const isOwner = state.ownerUserId === senderId;
  const authorized = state.authorizedTargets.some((target) => telegramCodexTargetKey(target) === key);
  if (!authorized && (isPrivate || isOwner)) {
    state.authorizedTargets.push({
      provider,
      accountId,
      targetId,
      ...(threadId ? { threadId } : {}),
      authorizedByUserId: senderId,
      authorizedAt: now,
    });
    changed = true;
  }

  const nowAuthorized = authorized || isPrivate || isOwner;
  if (!isOwner && !nowAuthorized) {
    if (changed) writeTelegramCodexBridgeState(statePath, state);
    writeJson(input.context.stdout, { actions: [{ type: "ignore", reason: "target not authorized by owner" }] });
    return CLI_EXIT_OK;
  }
  if (!shouldReplyToTelegramCodexMessage(event, state.replyPolicy, botUsername)) {
    if (changed) writeTelegramCodexBridgeState(statePath, state);
    writeJson(input.context.stdout, { actions: [{ type: "ignore", reason: "reply policy did not match" }] });
    return CLI_EXIT_OK;
  }

  if (changed) writeTelegramCodexBridgeState(statePath, state);

  const requestedClawSurface = resolveTelegramClawDomainRequest(rawText);
  if (requestedClawSurface) {
    const text = buildTelegramClawDomainReply(requestedClawSurface, input.flags);
    writeJson(input.context.stdout, {
      actions: [
        {
          type: "grant_permission",
          targetId,
          agentId: input.agentId,
          permissions: ["write"],
          priority: 100,
          metadata: {
            source: "telegram-codex-bridge",
            ownerUserId: state.ownerUserId,
          },
        },
        {
          type: "send_message",
          targetId,
          text,
          ...(threadId ? { threadId } : {}),
          agentId: input.agentId,
          metadata: {
            source: "telegram-claw-domain",
            surface: requestedClawSurface.id,
            ownerUserId: state.ownerUserId,
          },
        },
      ],
    });
    return CLI_EXIT_OK;
  }

  const targetLabel = threadId ? `${targetId} topic ${threadId}` : targetId;
  const claw = await createCliClaw(input.runtimeAdapterId, input.flags, input.workspaceRoot, input.appId, input.workspaceId, input.agentId, input.argv) as TelegramCodexClaw;
  const baseSystemPrompt = input.flags["system-prompt"] || [
    "You are Codex responding through a Telegram bot.",
    "Be concise, useful, and clear.",
    "You are running in the configured ClawJS runtime environment.",
  ].join(" ");
  const skillCapsules = (claw.library as typeof claw.library & {
    resolveSkillCapsules: (input?: { agentId?: string; workspaceId?: string }) => { prompt: string };
  }).resolveSkillCapsules({
    agentId: input.agentId,
    workspaceId: input.workspaceId,
  });
  const systemPrompt = appendPromptSection(
    appendPromptSection(baseSystemPrompt, skillCapsules.prompt),
    TELEGRAM_CODEX_ATTACHMENT_INSTRUCTIONS,
  );
  const telegramRuleHints = {
    channel: provider,
    service: "telegram",
    domain: "channels",
    agent: input.agentId,
    limit: 20,
  };
  const sessionCommand = parseTelegramCodexSessionCommand(rawText);
  const runOptions = {
    coalescingWindowMs: input.flags["coalescing-window-ms"] ? Number(input.flags["coalescing-window-ms"]) : undefined,
    compactionThresholdChars: input.flags["compaction-threshold-chars"] ? Number(input.flags["compaction-threshold-chars"]) : undefined,
    maxRecentMessages: input.flags["max-recent-messages"] ? Number(input.flags["max-recent-messages"]) : undefined,
  };
  let sessionId = state.sessions[key];
  const rotatesSession = sessionCommand?.command === "new" || sessionCommand?.command === "reset";
  if (rotatesSession || !sessionId) {
    sessionId = rotatesSession
      ? claw.sessions.createSession(`Telegram ${targetLabel}`).sessionId
      : claw.sessions.resolveChannelSession({
        provider,
        accountId,
        targetId,
        ...(threadId ? { threadId } : {}),
      }).sessionId;
    if (state.sessions[key] !== sessionId) {
      state.sessions[key] = sessionId;
      writeTelegramCodexBridgeState(statePath, state);
    }
  }
  const run = rotatesSession
    ? claw.channelRuns.resetChannelRun({ provider, accountId, targetId, ...(threadId ? { threadId } : {}), sessionId, options: runOptions })
    : claw.channelRuns.resolveOrCreateChannelRun({ provider, accountId, targetId, ...(threadId ? { threadId } : {}), sessionId, options: runOptions });
  const useChannelSessionHelpers = !rotatesSession && sessionId.startsWith("channel-");
  if (useChannelSessionHelpers) {
    claw.sessions.backfillChannelSession({
      provider,
      accountId,
      targetId,
      ...(threadId ? { threadId } : {}),
      ...(event.message?.providerMessageId ? { excludeProviderMessageIds: [event.message.providerMessageId] } : {}),
    });
  }
  const providerMessageId = event.message?.providerMessageId;
  const userMessageId = `telegram-codex-${hashStableId([
    key,
    "inbound",
    providerMessageId || rawText,
  ].join(":"))}`;
  if (!state.sessions[key]) {
    state.sessions[key] = sessionId;
    writeTelegramCodexBridgeState(statePath, state);
  }

  const sendTextAction = (text: string, metadata: Record<string, unknown> = {}) => ({
    type: "send_message",
    targetId,
    text,
    ...(threadId ? { threadId } : {}),
    agentId: input.agentId,
    metadata: {
      sessionId,
      ownerUserId: state.ownerUserId,
      ...metadata,
    },
  });

  const command = sessionCommand?.command;
  if (command === "status") {
    writeJson(input.context.stdout, { actions: [sendTextAction(formatTelegramCodexStatus(run, sessionId))] });
    return CLI_EXIT_OK;
  }
  if (command === "queue") {
    const current = claw.channelRuns.getChannelRunStatus(run.runKey);
    const queued = current?.queue ?? [];
    writeJson(input.context.stdout, { actions: [sendTextAction(queued.length ? `Queued messages: ${queued.length}` : "Queue is empty.")] });
    return CLI_EXIT_OK;
  }
  if (command === "stop") {
    const stopped = claw.channelRuns.requestChannelRunStop(run.runKey);
    writeJson(input.context.stdout, { actions: [sendTextAction(stopped?.activeRunId ? "Stop requested." : "No active run.")] });
    return CLI_EXIT_OK;
  }
  if (command === "summary") {
    const current = claw.channelRuns.getChannelRunStatus(run.runKey);
    writeJson(input.context.stdout, { actions: [sendTextAction(current?.summary || "No summary yet.")] });
    return CLI_EXIT_OK;
  }
  if (command === "debug") {
    const current = claw.channelRuns.getChannelRunStatus(run.runKey);
    writeJson(input.context.stdout, {
      actions: [sendTextAction([
        `runKey=${run.runKey}`,
        `status=${current?.status ?? "idle"}`,
        `queue=${current?.queue.length ?? 0}`,
        `session=${sessionId}`,
        `summary=${current?.summary ? "yes" : "no"}`,
      ].join("\n"))],
    });
    return CLI_EXIT_OK;
  }
  if (command === "compact") {
    const compacted = claw.channelRuns.compactChannelSession({ runKey: run.runKey, sessionId, force: true });
    writeJson(input.context.stdout, { actions: [sendTextAction(compacted.summary || "Nothing to compact.")] });
    return CLI_EXIT_OK;
  }

  const activeRun = claw.channelRuns.getChannelRunStatus(run.runKey);
  if (activeRun && (activeRun.status === "running" || activeRun.status === "stopping") && command !== "continue") {
    claw.channelRuns.enqueueChannelMessage(run.runKey, {
      id: userMessageId,
      content: formatTelegramCodexPrompt(event, stripTelegramCodexCommand(rawText, botUsername)),
      ...(providerMessageId ? { providerMessageId } : {}),
      senderId,
      ...(event.message?.senderLabel ? { senderLabel: event.message.senderLabel } : {}),
      metadata: {
        source: "telegram-codex-bridge",
        ...(event.message?.metadata ?? {}),
      },
    });
    writeJson(input.context.stdout, { actions: [{ type: "ignore", reason: "queued while run is active" }] });
    return CLI_EXIT_OK;
  }

  const appendUserTurn = (content: string, metadata: Record<string, unknown>, id: string) => (
    useChannelSessionHelpers
      ? claw.sessions.appendChannelMessage({
        provider,
        accountId,
        targetId,
        ...(threadId ? { threadId } : {}),
        direction: "inbound",
        role: "user",
        content,
        ...(metadata.providerMessageId ? { providerMessageId: String(metadata.providerMessageId) } : {}),
        senderId: typeof metadata.senderId === "string" ? metadata.senderId : senderId,
        ...(typeof metadata.senderLabel === "string" ? { senderLabel: metadata.senderLabel } : event.message?.senderLabel ? { senderLabel: event.message.senderLabel } : {}),
        metadata: {
          source: "telegram-codex-bridge",
          ...metadata,
        },
      })
      : claw.sessions.appendMessageOnce(sessionId, {
        id,
        role: "user",
        content,
        metadata: {
          source: "telegram-codex-bridge",
          provider,
          accountId,
          targetId,
          ...(threadId ? { threadId: String(threadId) } : {}),
          direction: "inbound",
          ...metadata,
        },
      })
  );

  const appendAssistantTurn = (text: string, metadata: Record<string, unknown>) => {
    if (useChannelSessionHelpers) {
      claw.sessions.appendChannelMessage({
        provider,
        accountId,
        targetId,
        ...(threadId ? { threadId } : {}),
        direction: "outbound",
        role: "assistant",
        content: text,
        metadata: {
          source: "telegram-codex-bridge",
          ...metadata,
        },
      });
    } else {
      claw.sessions.appendMessageOnce(sessionId, {
        id: `telegram-codex-${hashStableId([key, "outbound", userMessageId, text].join(":"))}`,
        role: "assistant",
        content: text,
        metadata: {
          source: "telegram-codex-bridge",
          provider,
          accountId,
          targetId,
          ...(threadId ? { threadId: String(threadId) } : {}),
          direction: "outbound",
          ...metadata,
        },
      });
    }
  };

  const replies: Array<{ text: string; transport?: string; fallback?: boolean }> = [];
  const processPrompt = async (content: string, metadata: Record<string, unknown>, messageId: string): Promise<"processed" | "duplicate" | "stopped"> => {
    const userMessage = appendUserTurn(content, metadata, messageId);
    if (!userMessage.appended) return "duplicate";
    const runId = `telegram-codex-${hashStableId([run.runKey, messageId, Date.now()].join(":"))}`;
    claw.channelRuns.processChannelRun({ runKey: run.runKey, sessionId, phase: "start", runId });
    try {
      const currentSession = claw.sessions.getSession(sessionId);
      const currentRun = claw.channelRuns.getChannelRunStatus(run.runKey);
      const charCount = currentSession?.messages.reduce((sum, message) => sum + message.content.length, 0) ?? 0;
      if (currentSession && currentRun && charCount > currentRun.compactionThresholdChars) {
        claw.channelRuns.compactChannelSession({ runKey: run.runKey, sessionId });
      }
      const latestRun = claw.channelRuns.getChannelRunStatus(run.runKey);
      const session = claw.sessions.getSession(sessionId);
      const messages = session?.messages.length
        ? buildTelegramCodexEffectiveMessages(session, {
          summaryMessageId: latestRun?.summaryMessageId,
          maxRecentMessages: latestRun?.maxRecentMessages,
        })
        : [{ role: "user" as const, content }];
      const result = await claw.inference.generateText({
        systemPrompt,
        contextBlocks: [
          { title: "Telegram", content: `provider=${provider}\naccount=${accountId}\ntarget=${targetLabel}\nsender=${event.message?.senderLabel ?? senderId}` },
        ],
        ruleHints: telegramRuleHints,
        messages,
        transport: (input.flags.transport as "auto" | "gateway" | "cli" | undefined) ?? "auto",
        ...(input.flags.model ? { model: input.flags.model } : {}),
        ...(input.flags["gateway-retries"] ? { gatewayRetries: Number(input.flags["gateway-retries"]) } : { gatewayRetries: 1 }),
      });
      const afterRun = claw.channelRuns.getChannelRunStatus(run.runKey);
      if (afterRun?.stopRequestedRunId === runId || afterRun?.status === "stopping") {
        claw.channelRuns.processChannelRun({ runKey: run.runKey, sessionId, phase: "succeed", runId });
        return "stopped";
      }
      if (result.text) {
        appendAssistantTurn(result.text, { ...(result.transport ? { transport: result.transport } : {}), fallback: result.fallback });
        replies.push({ text: result.text, ...(result.transport ? { transport: result.transport } : {}), fallback: result.fallback });
      }
      claw.channelRuns.processChannelRun({ runKey: run.runKey, sessionId, phase: "succeed", runId });
      return "processed";
    } catch (error) {
      claw.channelRuns.processChannelRun({
        runKey: run.runKey,
        sessionId,
        phase: "fail",
        runId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };

  const promptText = sessionCommand?.rest
    ? sessionCommand.rest
    : rotatesSession && sessionCommand
      ? telegramCodexResetPrompt(sessionCommand.command === "reset" ? "reset" : "new")
      : command === "continue"
        ? ""
        : stripTelegramCodexCommand(rawText, botUsername);
  const persistUserMessage = !(rotatesSession && sessionCommand && !sessionCommand.rest) && command !== "continue";
  if (!persistUserMessage && rotatesSession && sessionCommand) {
    const resetText = sessionCommand.command === "reset"
      ? "Session reset. What do you want to do next?"
      : "New session is ready. What do you want to do next?";
    appendAssistantTurn(resetText, { command: sessionCommand.command, sessionReset: true });
    replies.push({ text: resetText, transport: "cli", fallback: false });
  } else if (persistUserMessage) {
    const processed = await processPrompt(formatTelegramCodexPrompt(event, promptText), {
      ...(providerMessageId ? { providerMessageId } : {}),
      senderId,
      ...(event.message?.senderLabel ? { senderLabel: event.message.senderLabel } : {}),
      ...(sessionCommand ? { command: sessionCommand.command, sessionReset: rotatesSession } : {}),
      ...(event.message?.metadata ?? {}),
    }, userMessageId);
    if (processed === "duplicate") {
      writeJson(input.context.stdout, { actions: [{ type: "ignore", reason: "duplicate message" }] });
      return CLI_EXIT_OK;
    }
  }

  const queued = claw.channelRuns.drainQueuedChannelMessages(run.runKey);
  if (queued.length > 0) {
    await processPrompt(formatTelegramCodexQueuedPrompt(queued), {
      queued: true,
      queuedCount: queued.length,
    }, `telegram-codex-${hashStableId([run.runKey, "queued", queued.map((message) => message.id).join(":")].join(":"))}`);
  } else if (command === "continue" && !persistUserMessage) {
    writeJson(input.context.stdout, { actions: [sendTextAction("Queue is empty.")] });
    return CLI_EXIT_OK;
  }

  const actions: Array<Record<string, unknown>> = [];
  const mediaActions: Array<Record<string, unknown>> = [];
  for (const reply of replies) {
    const parsedReply = parseTelegramCodexMediaActions(reply.text);
    for (const text of splitTelegramMessage(parsedReply.text)) {
      actions.push(sendTextAction(text, { transport: reply.transport, fallback: reply.fallback }));
    }
    mediaActions.push(...parsedReply.mediaActions.map((action) => {
      const repairedMedia = maybeRerenderSlidesPdfMedia(action.media);
      return {
        ...action,
        ...(repairedMedia ? { media: repairedMedia } : {}),
        targetId: action.targetId ?? targetId,
        ...(action.threadId !== undefined ? { threadId: action.threadId } : threadId ? { threadId } : {}),
        agentId: input.agentId,
        metadata: {
          ...(action.metadata ?? {}),
          ...(repairedMedia ? { slidesMediaRerendered: true, originalMedia: action.media } : {}),
          sessionId,
          transport: reply.transport,
          fallback: reply.fallback,
          ownerUserId: state.ownerUserId,
        },
      };
    }));
  }
  if (actions.length > 0 || mediaActions.length > 0) {
    actions.unshift({
      type: "grant_permission",
      targetId,
      agentId: input.agentId,
      permissions: ["write"],
      priority: 100,
      metadata: {
        source: "telegram-codex-bridge",
        ownerUserId: state.ownerUserId,
      },
    });
    actions.push(...mediaActions);
  }
  if (actions.length === 0) {
    actions.push({ type: "ignore", reason: "codex returned empty response" });
  }
  writeJson(input.context.stdout, {
    actions,
  });
  return CLI_EXIT_OK;
}

async function createCliClaw(
  runtimeAdapter: RuntimeAdapterId,
  flags: Record<string, string>,
  workspaceRoot: string,
  appId: string,
  workspaceId: string,
  agentId: string,
  argv: string[] = [],
) {
  const explicitSecretsBackend = flags["secrets-url"] || flags["secrets-token"] || flags["secrets-tenant-id"] ? "secrets" : undefined;
  return createClaw({
    runtime: {
      adapter: runtimeAdapter,
      agentDir: flags["agent-dir"],
      provider: flags.provider,
      model: flags.model,
      wire: flags.wire as "chat_completions" | "responses" | undefined,
      baseUrl: flags["base-url"],
      secretRef: flags["secret-ref"],
      envKey: flags["env-key"],
      permissionMode: flags.sandbox as "read-only" | "workspace-write" | "danger-full-access" | undefined,
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
      || flags["secrets-url"]
      || flags["secrets-token"]
      || flags["secrets-tenant-id"]
      || process.env.CLAW_SECRETS_BACKEND
      || process.env.CLAW_SECRETS_BASE_URL
      || process.env.CLAW_SECRETS_TOKEN
      || process.env.CLAW_SECRETS_TENANT_ID
    ) ? {
      backend: (flags["secrets-backend"] || explicitSecretsBackend || process.env.CLAW_SECRETS_BACKEND) as "local_proxy" | "secrets" | undefined,
      baseUrl: flags["secrets-url"] || process.env.CLAW_SECRETS_BASE_URL,
      credential: flags["secrets-token"] || process.env.CLAW_SECRETS_TOKEN,
      tenantId: flags["secrets-tenant-id"] || process.env.CLAW_SECRETS_TENANT_ID,
      sidecarPath: flags["secrets-sidecar"] || process.env.CLAW_SECRETS_SIDECAR_PATH,
    } : undefined,
    templates: {
      pack: flags["template-pack"],
    },
    library: {
      rootDir: flags["library-dir"],
    },
    rules: {
      rootDir: flags["rules-dir"],
    },
    skills: {
      homeDir: flags["skills-home"],
      // Default OFF in CLI to avoid surprising user-home filesystem mutations.
      // Use `claw skills import` explicitly to opt in.
      autoImport: process.env.CLAW_SKILLS_AUTO_IMPORT === "1",
    },
    images: {
      rootDir: flags["image-library"],
      allowEnvCredentials: readBooleanFlag(argv, flags, "allow-env-credentials", false),
      openaiBaseUrl: flags["openai-base-url"],
      env: {
        ...process.env,
        ...(flags["secret-ref"] ? { CLAW_OPENAI_IMAGE_SECRET_REF: flags["secret-ref"] } : {}),
        ...(flags["openai-base-url"] ? { CLAW_OPENAI_IMAGE_BASE_URL: flags["openai-base-url"] } : {}),
      },
    },
    notify: flags["notify-url"]
      ? {
        baseUrl: flags["notify-url"],
        sourceToken: flags["notify-source-token"],
        clientToken: flags["notify-client-token"],
      }
      : undefined,
    time: flags["time-url"] || process.env.CLAW_TIME_URL
      ? {
        baseUrl: flags["time-url"] || process.env.CLAW_TIME_URL || "",
        token: flags["time-token"] || process.env.CLAW_TIME_TOKEN,
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
): Promise<WorkspaceClawInstance> {
  return createWorkspaceClaw({
    runtime: {
      adapter: runtimeAdapter,
      agentDir: flags["agent-dir"],
      provider: flags.provider,
      model: flags.model,
      wire: flags.wire as "chat_completions" | "responses" | undefined,
      baseUrl: flags["base-url"],
      secretRef: flags["secret-ref"],
      envKey: flags["env-key"],
      permissionMode: flags.sandbox as "read-only" | "workspace-write" | "danger-full-access" | undefined,
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
    time: flags["time-url"] || process.env.CLAW_TIME_URL
      ? {
        baseUrl: flags["time-url"] || process.env.CLAW_TIME_URL || "",
        token: flags["time-token"] || process.env.CLAW_TIME_TOKEN,
      }
      : undefined,
  });
}

async function runCoreProductivityDbCli(input: {
  argv: string[];
  positionals: string[];
  flags: Record<string, string>;
  workspaceRoot: string;
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
  wantsJson: boolean;
  appId: string;
  workspaceId: string;
  agentId: string;
  contextCwd: string;
}): Promise<number> {
  const { argv, flags, workspaceRoot, stdout, stderr, wantsJson, appId, workspaceId, agentId, contextCwd } = input;
  let { positionals } = input;
  const collectionName = coreProductivityCollection(positionals[1]);
  if (!collectionName) {
    throw new CliHandledError("usage_error", "Unknown productivity collection.", CLI_EXIT_USAGE);
  }
  const rawAction = positionals[2];
  const dbActions = new Set(["list", "get", "create", "update", "delete", "schema"]);
  const action = dbActions.has(rawAction || "") ? rawAction! : "create";
  if (!dbActions.has(rawAction || "")) {
    positionals = [positionals[0], positionals[1], "create", ...positionals.slice(2)];
  }
  const claw = await createCliWorkspaceClaw(resolveRuntimeAdapterId(flags), flags, workspaceRoot, appId, workspaceId, agentId, contextCwd);
  if (!wantsJson) stderr.write("Using local database for this project\n");

  const apiName = ({
    people: "people",
    saved_views: "savedViews",
    custom_fields: "customFields",
    field_values: "fieldValues",
  } as Record<string, string>)[collectionName] ?? collectionName;
  const api = (claw as unknown as Record<string, any>)[apiName];
  if (!api) {
    throw new CliHandledError("usage_error", `Unsupported productivity collection "${collectionName}".`, CLI_EXIT_USAGE);
  }

  if (action === "schema") {
    const primary = collectionName === "people" ? "displayName" : ["projects", "cycles", "saved_views", "custom_fields", "templates"].includes(collectionName) ? "name" : collectionName === "field_values" ? "fieldId" : collectionName === "comments" ? "body" : "title";
    writeJson(stdout, {
      exists: true,
      collection: {
        name: collectionName,
        builtin: true,
        protected: true,
        fields: [
          { name: "id", type: "text", required: true },
          { name: primary, type: "text", required: true },
          { name: "status", type: "text" },
          { name: "createdAt", type: "datetime" },
          { name: "updatedAt", type: "datetime" },
          { name: "archivedAt", type: "datetime" },
        ],
      },
      autoCreateOnWrite: false,
    });
    return CLI_EXIT_OK;
  }

  if (action === "list") {
    const items = await api.list({
      ...(flags.status ? { status: parseCsvFlag(flags.status) } : {}),
      ...(flags["project-id"] ? { projectId: flags["project-id"] } : {}),
      ...(flags["goal-id"] ? { goalId: flags["goal-id"] } : {}),
      ...(flags["area-id"] ? { areaId: flags["area-id"] } : {}),
      ...(flags["anchor-id"] ? { anchorId: flags["anchor-id"] } : {}),
      ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      includeArchived: readBooleanFlag(argv, flags, "include-archived", false),
    });
    if (wantsJson) writeJson(stdout, items);
    else stdout.write(`${items.map((item: any) => `${item.status ?? ""} ${item.id} ${item.title ?? item.name ?? item.displayName ?? ""}`.trim()).join("\n")}\n`);
    return CLI_EXIT_OK;
  }

  if (action === "get") {
    const id = positionals[3] || flags.id;
    if (!id) throw new CliHandledError("usage_error", "Usage: claw db <collection> get <id>", CLI_EXIT_USAGE);
    const item = collectionName === "people" ? await claw.people.get(id) : await api.get(id);
    if (!item) throw new CliHandledError("not_found", `${collectionName} record not found: ${id}`);
    if (wantsJson) writeJson(stdout, item);
    else stdout.write(`${Object.entries(item).map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`).join("\n")}\n`);
    return CLI_EXIT_OK;
  }

  if (action === "delete") {
    const id = positionals[3] || flags.id;
    if (!id) throw new CliHandledError("usage_error", "Usage: claw db <collection> delete <id> [--force]", CLI_EXIT_USAGE);
    if (collectionName === "people") {
      throw new CliHandledError("unsupported_operation", "People records do not support delete through the productivity API.");
    }
    const force = readBooleanFlag(argv, flags, "force", false);
    if (force) {
      const removed = await api.remove(id);
      if (!removed) throw new CliHandledError("not_found", `${collectionName} record not found: ${id}`);
      if (wantsJson) writeJson(stdout, { ok: true, deleted: true, archived: false });
      else stdout.write("ok\n");
      return CLI_EXIT_OK;
    }
    const archived = await api.archive(id);
    if (wantsJson) writeJson(stdout, { ok: true, deleted: false, archived: true, record: archived });
    else stdout.write(`${archived.id}\n`);
    return CLI_EXIT_OK;
  }

  const { recordId, payload } = mergeCoreDbInput(action as "create" | "update", collectionName, positionals, flags, argv);
  if (action === "update" && !recordId) {
    throw new CliHandledError("usage_error", "Usage: claw db <collection> update <id> [--set key=value ...]", CLI_EXIT_USAGE);
  }

  let result: unknown;
  if (collectionName === "people") {
    const displayName = pickCoreTitle(collectionName, payload);
    if (!displayName) throw new CliHandledError("usage_error", "Usage: claw db people create <display-name>", CLI_EXIT_USAGE);
    result = await claw.people.upsert({
      id: action === "update" ? recordId : typeof payload.id === "string" ? payload.id : undefined,
      displayName,
      kind: payload.kind as "human" | "agent" | "org" | undefined,
      emails: Array.isArray(payload.emails) ? payload.emails as string[] : undefined,
      phones: Array.isArray(payload.phones) ? payload.phones as string[] : undefined,
      handles: Array.isArray(payload.handles) ? payload.handles as string[] : undefined,
      role: typeof payload.role === "string" ? payload.role : undefined,
      organization: typeof payload.organization === "string" ? payload.organization : undefined,
    });
  } else if (action === "create") {
    const requiredTitle = pickCoreTitle(collectionName, payload);
    if (!requiredTitle) throw new CliHandledError("usage_error", `Usage: claw db ${collectionName} create <title>`, CLI_EXIT_USAGE);
    result = await api.create(payload);
  } else {
    const current = await api.get(recordId);
    if (!current) throw new CliHandledError("not_found", `${collectionName} record not found: ${recordId}`);
    result = await api.update(recordId, payload);
  }

  if (wantsJson) writeJson(stdout, result);
  else {
    const record = result as { id?: string; title?: string; name?: string; displayName?: string };
    stdout.write(`${action === "create" ? "Created" : "Updated"} ${singularCoreCollection(collectionName)} ${record.id ?? ""} "${record.title ?? record.name ?? record.displayName ?? ""}"\n`);
  }
  return CLI_EXIT_OK;
}

async function archiveOrRemoveProductivityRecord(
  api: { archive: (id: string) => Promise<unknown>; remove: (id: string) => Promise<boolean> },
  id: string,
  argv: string[],
  flags: Record<string, string>,
  label: string,
): Promise<{ ok: true; deleted: boolean; archived: boolean; record?: unknown }> {
  if (readBooleanFlag(argv, flags, "force", false)) {
    const removed = await api.remove(id);
    if (!removed) throw new CliHandledError("not_found", `${label} record not found: ${id}`);
    return { ok: true, deleted: true, archived: false };
  }
  const record = await api.archive(id);
  return { ok: true, deleted: false, archived: true, record };
}

function requireOneOf<T extends string>(value: string | undefined, values: Set<string>, label: string): T {
  if (!value || !values.has(value)) {
    throw new CliHandledError("usage_error", `${label} must be one of: ${[...values].join(", ")}`, CLI_EXIT_USAGE);
  }
  return value as T;
}

async function runOutcomesCli(input: {
  argv: string[];
  positionals: string[];
  flags: Record<string, string>;
  context: CliContext;
  wantsJson: boolean;
  binName: string;
  workspaceRoot: string;
  appId: string;
  workspaceId: string;
  agentId: string;
  runtimeAdapterId: RuntimeAdapterId;
}): Promise<number> {
  const { argv, positionals, flags, context, wantsJson, binName, workspaceRoot, appId, workspaceId, agentId, runtimeAdapterId } = input;
  const [, command, subcommand] = positionals;
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, argv);

  try {
    if (command === "add") {
      const subject = flags.subject || flags.title || joinedPositionals(positionals, 2);
      const result = requireOneOf<OutcomeResult>(flags.result, OUTCOME_RESULTS, "result");
      const note = flags.note || flags.reason;
      const score = flags.score !== undefined ? Number(flags.score) : Number.NaN;
      if (!subject || !note || !Number.isFinite(score)) {
        context.stderr.write(`Usage: ${binName} outcomes add --subject TEXT --result worked|failed|mixed --score 0.82 --note TEXT\n`);
        return CLI_EXIT_USAGE;
      }
      const outcome = claw.outcomes.add({
        subject,
        result,
        score,
        note,
        judgment: flags.judgment || flags["judgment-id"],
        session: flags.session || flags["session-id"],
        learning: flags.learning || flags["learning-id"],
        task: flags.task || flags["task-id"],
        artifact: flags.artifact || flags["artifact-id"],
      });
      if (wantsJson) writeJson(context.stdout, outcome);
      else context.stdout.write(`${outcome.id} ${outcome.result} score=${outcome.score.toFixed(2)} gap=${outcome.confidenceGap?.toFixed(2) ?? "n/a"}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "capture") {
      const sessionId = flags.session || flags["session-id"] || subcommand;
      if (!sessionId) {
        context.stderr.write(`Usage: ${binName} outcomes capture --session <session-id> [--json]\n`);
        return CLI_EXIT_USAGE;
      }
      const result = claw.outcomes.capture({ sessionId });
      if (wantsJson) writeJson(context.stdout, result);
      else context.stdout.write(result.ignored ? `ignored ${sessionId}: ${result.reason ?? "no outcome"}\n` : `${result.outcomes.map((outcome) => `${outcome.id} ${outcome.result} ${outcome.subject}`).join("\n")}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "list") {
      const outcomes = claw.outcomes.list({
        ...(flags.result ? { result: requireOneOf<OutcomeResult>(flags.result, OUTCOME_RESULTS, "result") } : {}),
        ...(flags.status ? { status: requireOneOf<OutcomeStatus>(flags.status, OUTCOME_STATUSES, "status") } : {}),
        ...(flags.judgment ? { judgment: flags.judgment } : {}),
      });
      if (wantsJson) writeJson(context.stdout, { outcomes });
      else context.stdout.write(`${outcomes.map((outcome) => `${outcome.status} ${outcome.result} ${outcome.score.toFixed(2)} ${outcome.id} ${outcome.subject}`).join("\n")}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "show" || command === "inspect") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write(`Usage: ${binName} outcomes show <outcome-id> [--json]\n`);
        return CLI_EXIT_USAGE;
      }
      const outcome = claw.outcomes.show(id);
      if (!outcome) throw new CliHandledError("not_found", `Outcome not found: ${id}`, CLI_EXIT_FAILURE);
      if (wantsJson) writeJson(context.stdout, outcome);
      else context.stdout.write(`${outcome.status} ${outcome.result} ${outcome.id}\n${outcome.subject}\nscore=${outcome.score.toFixed(2)} expected=${outcome.expectedConfidence?.toFixed(2) ?? "n/a"} gap=${outcome.confidenceGap?.toFixed(2) ?? "n/a"}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "link") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write(`Usage: ${binName} outcomes link <outcome-id> --judgment ID|--learning ID|--session ID|--task ID|--artifact ID\n`);
        return CLI_EXIT_USAGE;
      }
      const outcome = claw.outcomes.link(id, {
        judgment: flags.judgment || flags["judgment-id"],
        session: flags.session || flags["session-id"],
        learning: flags.learning || flags["learning-id"],
        task: flags.task || flags["task-id"],
        artifact: flags.artifact || flags["artifact-id"],
      });
      if (wantsJson) writeJson(context.stdout, outcome);
      else context.stdout.write(`${outcome.id}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "archive") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write(`Usage: ${binName} outcomes archive <outcome-id> [--reason TEXT]\n`);
        return CLI_EXIT_USAGE;
      }
      const outcome = claw.outcomes.archive(id, flags.reason);
      if (wantsJson) writeJson(context.stdout, outcome);
      else context.stdout.write(`archived ${outcome.id}\n`);
      return CLI_EXIT_OK;
    }
  } catch (error) {
    const handled = cliErrorFromUnknown(error);
    if (wantsJson) writeCliError(context.stdout, handled);
    else context.stderr.write(`${handled.message}\n`);
    return handled.exitCode;
  }

  context.stderr.write(`Usage: ${binName} outcomes add|capture|list|show|link|archive\n`);
  return CLI_EXIT_USAGE;
}

async function runContextCli(input: {
  argv: string[];
  positionals: string[];
  flags: Record<string, string>;
  context: CliContext;
  wantsJson: boolean;
  binName: string;
  workspaceRoot: string;
  appId: string;
  workspaceId: string;
  agentId: string;
  runtimeAdapterId: RuntimeAdapterId;
}): Promise<number> {
  const { argv, positionals, flags, context, wantsJson, binName, workspaceRoot, appId, workspaceId, agentId, runtimeAdapterId } = input;
  const [, command, subcommand] = positionals;
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, argv);

  try {
    if (command === "prepare") {
      const query = flags.query || flags.prompt || joinedPositionals(positionals, 2);
      if (!query) {
        context.stderr.write(`Usage: ${binName} context prepare --query TEXT [--purpose judgment|prompt|task|session|manual]\n`);
        return CLI_EXIT_USAGE;
      }
      const pack = claw.context.prepare({
        query,
        purpose: flags.purpose ? requireOneOf<ContextPackPurpose>(flags.purpose, CONTEXT_PURPOSES, "purpose") : undefined,
        domain: flags.domain,
        sessionId: flags.session || flags["session-id"],
        ...(flags["max-items"] ? { maxItems: Number(flags["max-items"]) } : {}),
        ...(flags["max-chars"] ? { maxChars: Number(flags["max-chars"]) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, pack);
      else context.stdout.write(`${pack.id} ${pack.purpose} items=${pack.items.length} chars=${pack.budget.charCount}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "list") {
      const packs = claw.context.list({
        ...(flags.purpose ? { purpose: requireOneOf<ContextPackPurpose>(flags.purpose, CONTEXT_PURPOSES, "purpose") } : {}),
        ...(flags.status ? { status: requireOneOf<ContextPackStatus>(flags.status, CONTEXT_STATUSES, "status") } : {}),
      });
      if (wantsJson) writeJson(context.stdout, { contexts: packs });
      else context.stdout.write(`${packs.map((pack) => `${pack.status} ${pack.purpose} ${pack.id} items=${pack.items.length} ${pack.query}`).join("\n")}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "show" || command === "inspect") {
      const id = subcommand || flags.id || flags.context;
      if (!id) {
        context.stderr.write(`Usage: ${binName} context show <context-id> [--json]\n`);
        return CLI_EXIT_USAGE;
      }
      const pack = claw.context.show(id);
      if (!pack) throw new CliHandledError("not_found", `Context pack not found: ${id}`, CLI_EXIT_FAILURE);
      if (wantsJson) writeJson(context.stdout, pack);
      else context.stdout.write(`${pack.status} ${pack.purpose} ${pack.id}\n${pack.summary}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "archive") {
      const id = subcommand || flags.id || flags.context;
      if (!id) {
        context.stderr.write(`Usage: ${binName} context archive <context-id> [--reason TEXT]\n`);
        return CLI_EXIT_USAGE;
      }
      const pack = claw.context.archive(id, flags.reason);
      if (wantsJson) writeJson(context.stdout, pack);
      else context.stdout.write(`archived ${pack.id}\n`);
      return CLI_EXIT_OK;
    }
  } catch (error) {
    const handled = cliErrorFromUnknown(error);
    if (wantsJson) writeCliError(context.stdout, handled);
    else context.stderr.write(`${handled.message}\n`);
    return handled.exitCode;
  }

  context.stderr.write(`Usage: ${binName} context prepare|list|show|archive\n`);
  return CLI_EXIT_USAGE;
}

async function runCommitmentsCli(input: {
  argv: string[];
  positionals: string[];
  flags: Record<string, string>;
  context: CliContext;
  wantsJson: boolean;
  binName: string;
  workspaceRoot: string;
  appId: string;
  workspaceId: string;
  agentId: string;
  runtimeAdapterId: RuntimeAdapterId;
}): Promise<number> {
  const { argv, positionals, flags, context, wantsJson, binName, workspaceRoot, appId, workspaceId, agentId, runtimeAdapterId } = input;
  const [, command, subcommand] = positionals;
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, argv);

  try {
    if (command === "capture") {
      const sessionId = flags.session || flags["session-id"] || subcommand;
      if (!sessionId) {
        context.stderr.write(`Usage: ${binName} commitments capture --session SESSION_ID [--json]\n`);
        return CLI_EXIT_USAGE;
      }
      const result = claw.commitments.capture({
        sessionId,
        ownerAgentId: flags["owner-agent"] || flags["owner-agent-id"],
        beneficiaryUserId: flags["beneficiary-user"] || flags["beneficiary-user-id"],
      });
      if (wantsJson) writeJson(context.stdout, result);
      else context.stdout.write(result.ignored ? `${result.reason ?? "No commitments captured."}\n` : `${result.commitments.map((commitment) => commitment.id).join("\n")}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "add") {
      const claim = flags.claim || joinedPositionals(positionals, 2);
      const kind = requireOneOf<CommitmentKind>(flags.kind, COMMITMENT_KINDS, "kind");
      if (!claim) {
        context.stderr.write(`Usage: ${binName} commitments add --claim TEXT --kind promise|follow_up|delivery [--remind-at ISO]\n`);
        return CLI_EXIT_USAGE;
      }
      const commitment = await claw.commitments.add({
        claim,
        kind,
        ownerAgentId: flags["owner-agent"] || flags["owner-agent-id"],
        ownerUserId: flags["owner-user"] || flags["owner-user-id"],
        beneficiaryUserId: flags["beneficiary-user"] || flags["beneficiary-user-id"],
        beneficiaryAgentId: flags["beneficiary-agent"] || flags["beneficiary-agent-id"],
        sessionId: flags.session || flags["session-id"],
        remindAt: flags["remind-at"],
        dueAt: flags["due-at"],
        taskId: flags.task || flags["task-id"],
      });
      if (wantsJson) writeJson(context.stdout, commitment);
      else context.stdout.write(`${commitment.id}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "list") {
      const commitments = claw.commitments.list({
        ...(flags.status ? { status: requireOneOf<CommitmentStatus>(flags.status, COMMITMENT_STATUSES, "status") } : {}),
        ...(flags.kind ? { kind: requireOneOf<CommitmentKind>(flags.kind, COMMITMENT_KINDS, "kind") } : {}),
        ...(flags["owner-agent"] || flags["owner-agent-id"] ? { ownerAgentId: flags["owner-agent"] || flags["owner-agent-id"] } : {}),
      });
      if (wantsJson) writeJson(context.stdout, { commitments });
      else context.stdout.write(`${commitments.map((commitment) => `${commitment.status} ${commitment.kind} ${commitment.id} ${commitment.claim}`).join("\n")}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "show" || command === "inspect") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write(`Usage: ${binName} commitments show <commitment-id> [--json]\n`);
        return CLI_EXIT_USAGE;
      }
      const commitment = claw.commitments.show(id);
      if (!commitment) throw new CliHandledError("not_found", `Commitment not found: ${id}`, CLI_EXIT_FAILURE);
      if (wantsJson) writeJson(context.stdout, commitment);
      else context.stdout.write(`${commitment.status} ${commitment.kind} ${commitment.id}\n${commitment.claim}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "fulfill" || command === "miss") {
      const id = subcommand || flags.id;
      const text = command === "fulfill" ? flags.outcome : flags.reason;
      if (!id || !text) {
        context.stderr.write(`Usage: ${binName} commitments ${command} <commitment-id> --${command === "fulfill" ? "outcome" : "reason"} TEXT\n`);
        return CLI_EXIT_USAGE;
      }
      const payload = {
        outcome: command === "fulfill" ? text : undefined,
        reason: command === "miss" ? text : undefined,
        evidenceSessionId: flags["evidence-session"] || flags.session || flags["session-id"],
        artifactId: flags.artifact || flags["artifact-id"],
      };
      const commitment = command === "fulfill" ? claw.commitments.fulfill(id, payload) : claw.commitments.miss(id, payload);
      if (wantsJson) writeJson(context.stdout, commitment);
      else context.stdout.write(`${commitment.status} ${commitment.id}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "cancel") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write(`Usage: ${binName} commitments cancel <commitment-id> [--reason TEXT]\n`);
        return CLI_EXIT_USAGE;
      }
      const commitment = claw.commitments.cancel(id, flags.reason);
      if (wantsJson) writeJson(context.stdout, commitment);
      else context.stdout.write(`${commitment.status} ${commitment.id}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "link") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write(`Usage: ${binName} commitments link <commitment-id> [--judgment ID] [--task ID]\n`);
        return CLI_EXIT_USAGE;
      }
      const commitment = claw.commitments.link(id, {
        session: flags.session || flags["session-id"],
        judgment: flags.judgment || flags["judgment-id"],
        decision: flags.decision || flags["decision-id"],
        learning: flags.learning || flags["learning-id"],
        task: flags.task || flags["task-id"],
        reminder: flags.reminder || flags["reminder-id"],
        deadline: flags.deadline || flags["deadline-id"],
        artifact: flags.artifact || flags["artifact-id"],
      });
      if (wantsJson) writeJson(context.stdout, commitment);
      else context.stdout.write(`${commitment.id}\n`);
      return CLI_EXIT_OK;
    }
  } catch (error) {
    const handled = cliErrorFromUnknown(error);
    if (wantsJson) writeCliError(context.stdout, handled);
    else context.stderr.write(`${handled.message}\n`);
    return handled.exitCode;
  }

  context.stderr.write(`Usage: ${binName} commitments capture|add|list|show|fulfill|miss|cancel|link\n`);
  return CLI_EXIT_USAGE;
}

async function runJudgmentCli(input: {
  argv: string[];
  positionals: string[];
  flags: Record<string, string>;
  context: CliContext;
  wantsJson: boolean;
  binName: string;
  workspaceRoot: string;
  appId: string;
  workspaceId: string;
  agentId: string;
  runtimeAdapterId: RuntimeAdapterId;
}): Promise<number> {
  const { argv, positionals, flags, context, wantsJson, binName, workspaceRoot, appId, workspaceId, agentId, runtimeAdapterId } = input;
  const [, command, subcommand] = positionals;
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, argv);

  try {
    if (command === "prepare") {
      const question = flags.question || flags.prompt || joinedPositionals(positionals, 2);
      const domain = flags.domain;
      if (!question || !domain) {
        context.stderr.write(`Usage: ${binName} judgment prepare --question TEXT --domain DOMAIN [--impact low|medium|high|critical] [--option VALUE ...]\n`);
        return CLI_EXIT_USAGE;
      }
      const judgment = claw.judgment.prepare({
        question,
        domain,
        impact: flags.impact ? requireOneOf<JudgmentImpact>(flags.impact, JUDGMENT_IMPACTS, "impact") : undefined,
        options: collectFlagValues(argv, "option"),
        sessionId: flags.session || flags["session-id"],
      });
      if (wantsJson) writeJson(context.stdout, judgment);
      else context.stdout.write(`${judgment.id} ${judgment.recommendation} ${judgment.recommendedOption ?? ""} confidence=${judgment.confidence.toFixed(2)}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "record") {
      const id = subcommand || flags.id;
      const chosen = flags.chosen || flags.option;
      const rationale = flags.rationale || flags.reason;
      if (!id || !chosen || !rationale) {
        context.stderr.write(`Usage: ${binName} judgment record <judgment-id> --chosen VALUE --rationale TEXT [--confidence 0.8]\n`);
        return CLI_EXIT_USAGE;
      }
      const judgment = claw.judgment.record(id, {
        chosen,
        rationale,
        ...(flags.confidence ? { confidence: Number(flags.confidence) } : {}),
        outcome: flags.outcome,
      });
      if (wantsJson) writeJson(context.stdout, judgment);
      else context.stdout.write(`${judgment.id} ${judgment.status} ${judgment.chosenOption ?? ""}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "list") {
      const judgments = claw.judgment.list({
        ...(flags.status ? { status: requireOneOf<JudgmentStatus>(flags.status, JUDGMENT_STATUSES, "status") } : {}),
        ...(flags.domain ? { domain: flags.domain } : {}),
      });
      if (wantsJson) writeJson(context.stdout, { judgments });
      else context.stdout.write(`${judgments.map((judgment) => `${judgment.status} ${judgment.confidence.toFixed(2)} ${judgment.id} ${judgment.question}`).join("\n")}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "show" || command === "inspect") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write(`Usage: ${binName} judgment show <judgment-id> [--json]\n`);
        return CLI_EXIT_USAGE;
      }
      const judgment = claw.judgment.show(id);
      if (!judgment) throw new CliHandledError("not_found", `Judgment not found: ${id}`, CLI_EXIT_FAILURE);
      if (wantsJson) writeJson(context.stdout, judgment);
      else context.stdout.write(`${judgment.status} ${judgment.recommendation} ${judgment.id}\n${judgment.question}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "link") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write(`Usage: ${binName} judgment link <judgment-id> --learning ID|--rule ID|--session ID|--decision ID\n`);
        return CLI_EXIT_USAGE;
      }
      const judgment = claw.judgment.link(id, {
        learning: flags.learning,
        rule: flags.rule,
        session: flags.session || flags["session-id"],
        decision: flags.decision || flags["decision-id"],
        artifact: flags.artifact || flags["artifact-id"],
        plan: flags.plan || flags["plan-id"],
        task: flags.task || flags["task-id"],
      });
      if (wantsJson) writeJson(context.stdout, judgment);
      else context.stdout.write(`${judgment.id}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "archive") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write(`Usage: ${binName} judgment archive <judgment-id> [--reason TEXT]\n`);
        return CLI_EXIT_USAGE;
      }
      const judgment = claw.judgment.archive(id, flags.reason);
      if (wantsJson) writeJson(context.stdout, judgment);
      else context.stdout.write(`archived ${judgment.id}\n`);
      return CLI_EXIT_OK;
    }
  } catch (error) {
    const handled = cliErrorFromUnknown(error);
    if (wantsJson) writeCliError(context.stdout, handled);
    else context.stderr.write(`${handled.message}\n`);
    return handled.exitCode;
  }

  context.stderr.write(`Usage: ${binName} judgment prepare|record|list|show|link|archive\n`);
  return CLI_EXIT_USAGE;
}

async function runLearningCli(input: {
  argv: string[];
  positionals: string[];
  flags: Record<string, string>;
  context: CliContext;
  wantsJson: boolean;
  binName: string;
  workspaceRoot: string;
  appId: string;
  workspaceId: string;
  agentId: string;
  runtimeAdapterId: RuntimeAdapterId;
}): Promise<number> {
  const { argv, positionals, flags, context, wantsJson, binName, workspaceRoot, appId, workspaceId, agentId, runtimeAdapterId } = input;
  const [, command, subcommand] = positionals;
  const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, argv);

  try {
    if (command === "capture") {
      const sessionId = flags.session || flags["session-id"] || subcommand;
      if (!sessionId) {
        context.stderr.write(`Usage: ${binName} learning capture --session <session-id> [--json]\n`);
        return CLI_EXIT_USAGE;
      }
      const result = claw.learning.capture({ sessionId });
      if (wantsJson) writeJson(context.stdout, result);
      else context.stdout.write(result.ignored ? `ignored ${sessionId}: ${result.reason ?? "no learning"}\n` : `${result.learnings.map((learning) => `${learning.id} ${learning.claim}`).join("\n")}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "add") {
      const claim = flags.claim || joinedPositionals(positionals, 2);
      const evidenceSessionId = flags["evidence-session"] || flags.session || flags["session-id"];
      if (!claim || !evidenceSessionId) {
        context.stderr.write(`Usage: ${binName} learning add --claim TEXT --target user|agent|project|workflow|runtime|ui --kind preference|observation|correction|workflow|failure --evidence-session ID\n`);
        return CLI_EXIT_USAGE;
      }
      const learning = claw.learning.add({
        claim,
        target: requireOneOf<LearningTarget>(flags.target, LEARNING_TARGETS, "target"),
        kind: requireOneOf<LearningKind>(flags.kind, LEARNING_KINDS, "kind"),
        evidenceSessionId,
        sentiment: flags.sentiment ? requireOneOf<LearningEvidenceSentiment>(flags.sentiment, LEARNING_SENTIMENTS, "sentiment") : undefined,
        note: flags.note,
        quote: flags.quote,
      });
      if (wantsJson) writeJson(context.stdout, learning);
      else context.stdout.write(`${learning.id}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "list") {
      const learnings = claw.learning.list({
        ...(flags.target ? { target: requireOneOf<LearningTarget>(flags.target, LEARNING_TARGETS, "target") } : {}),
        ...(flags.kind ? { kind: requireOneOf<LearningKind>(flags.kind, LEARNING_KINDS, "kind") } : {}),
        ...(flags.status ? { status: requireOneOf<LearningStatus>(flags.status, LEARNING_STATUSES, "status") } : {}),
      });
      if (wantsJson) writeJson(context.stdout, { learnings });
      else context.stdout.write(`${learnings.map((learning) => `${learning.status} ${learning.confidence.toFixed(2)} ${learning.id} ${learning.claim}`).join("\n")}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "show" || command === "inspect") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write(`Usage: ${binName} learning show <learning-id> [--json]\n`);
        return CLI_EXIT_USAGE;
      }
      const learning = claw.learning.show(id);
      if (!learning) throw new CliHandledError("not_found", `Learning not found: ${id}`, CLI_EXIT_FAILURE);
      if (wantsJson) writeJson(context.stdout, learning);
      else context.stdout.write(`${learning.status} ${learning.confidence.toFixed(2)} ${learning.id}\n${learning.claim}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "evidence" && subcommand === "add") {
      const id = positionals[3] || flags.id || flags.learning;
      const sessionId = flags.session || flags["session-id"];
      const note = flags.note;
      if (!id || !sessionId || !note) {
        context.stderr.write(`Usage: ${binName} learning evidence add <learning-id> --session ID --sentiment positive|negative|neutral --note TEXT\n`);
        return CLI_EXIT_USAGE;
      }
      const learning = claw.learning.addEvidence(id, {
        sessionId,
        sentiment: requireOneOf<LearningEvidenceSentiment>(flags.sentiment, LEARNING_SENTIMENTS, "sentiment"),
        note,
        quote: flags.quote,
      });
      if (wantsJson) writeJson(context.stdout, learning);
      else context.stdout.write(`${learning.id} confidence=${learning.confidence.toFixed(2)} evidence=${learning.evidence.length}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "promote") {
      const id = subcommand || flags.id || flags.learning;
      const to = requireOneOf<LearningPromotionTarget>(flags.to, LEARNING_PROMOTION_TARGETS, "to");
      if (!id) {
        context.stderr.write(`Usage: ${binName} learning promote <learning-id> --to rule|user|soul|skill|memory --dry-run|--apply\n`);
        return CLI_EXIT_USAGE;
      }
      const apply = readBooleanFlag(argv, flags, "apply", false);
      const dryRun = readBooleanFlag(argv, flags, "dry-run", !apply);
      const result = claw.learning.promote(id, { to, dryRun, apply });
      if (wantsJson) writeJson(context.stdout, result);
      else context.stdout.write(`${result.applied ? "applied" : "dry-run"} ${to} ${id}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "archive") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write(`Usage: ${binName} learning archive <learning-id> [--reason TEXT]\n`);
        return CLI_EXIT_USAGE;
      }
      const learning = claw.learning.archive(id, flags.reason);
      if (wantsJson) writeJson(context.stdout, learning);
      else context.stdout.write(`archived ${learning.id}\n`);
      return CLI_EXIT_OK;
    }
  } catch (error) {
    const handled = cliErrorFromUnknown(error);
    if (wantsJson) writeCliError(context.stdout, handled);
    else context.stderr.write(`${handled.message}\n`);
    return handled.exitCode;
  }

  context.stderr.write(`Usage: ${binName} learning capture|add|list|show|evidence add|promote|archive\n`);
  return CLI_EXIT_USAGE;
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
  if (process.env.CLAW_DATABASE_DIR?.trim()) {
    return path.resolve(process.env.CLAW_DATABASE_DIR);
  }
  return path.resolve(fileURLToPath(new URL("../../../database", import.meta.url)));
}

function resolveIotDirectory(flags: Record<string, string>, contextCwd: string): string {
  if (flags["iot-dir"]) {
    return path.resolve(contextCwd, flags["iot-dir"]);
  }
  if (process.env.CLAW_IOT_DIR?.trim()) {
    return path.resolve(process.env.CLAW_IOT_DIR);
  }
  return path.resolve(fileURLToPath(new URL("../../../iot", import.meta.url)));
}

function resolveErpDirectory(flags: Record<string, string>, contextCwd: string): string {
  if (flags["erp-dir"]) {
    return path.resolve(contextCwd, flags["erp-dir"]);
  }
  if (process.env.CLAW_ERP_DIR?.trim()) {
    return path.resolve(process.env.CLAW_ERP_DIR);
  }
  return path.resolve(fileURLToPath(new URL("../../../erp", import.meta.url)));
}

function resolveContentDirectory(flags: Record<string, string>, contextCwd: string): string {
  if (flags["content-dir"]) {
    return path.resolve(contextCwd, flags["content-dir"]);
  }
  if (process.env.CLAW_PUBLISHING_DIR?.trim()) {
    return path.resolve(process.env.CLAW_PUBLISHING_DIR);
  }
  return path.resolve(fileURLToPath(new URL("../../../content", import.meta.url)));
}

async function runDelegatedDatabaseCli(
  argv: string[],
  flags: Record<string, string>,
  context: CliContext,
): Promise<number> {
  if (!flags["database-dir"] && !process.env.CLAW_DATABASE_DIR?.trim()) {
    return await runEmbeddedDatabaseCli({
      argv: argv.slice(1),
      flags,
      stdout: context.stdout,
      stderr: context.stderr,
    });
  }
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
  const raw = flags["relay-url"] ?? process.env.CLAW_RELAY_URL ?? process.env.RELAY_URL ?? "";
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
  const accessToken = (flags["access-token"] ?? process.env.CLAW_RELAY_ACCESS_TOKEN ?? "").trim();
  const tenantId = (flags["tenant-id"] ?? process.env.CLAW_RELAY_TENANT_ID ?? "").trim();
  const agentId = (flags["agent-id"] ?? process.env.CLAW_RELAY_AGENT_ID ?? "").trim();
  const workspaceId = (flags["workspace-id"] ?? process.env.CLAW_RELAY_WORKSPACE_ID ?? "").trim();
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

type PreviewShareMode = "lan" | "tailscale" | "cloudflare" | "relay";

interface PreviewSharePayload {
  ok: true;
  mode: PreviewShareMode;
  targetUrl: string;
  shareUrl: string;
  token: string;
  tokenParam: string;
  expiresAt: string;
  qrPayload: string;
  provider?: {
    available: boolean;
    command?: string[];
    message?: string;
  };
}

function parsePreviewShareMode(value: string | undefined): PreviewShareMode {
  if (!value || value === "lan") return "lan";
  if (value === "tailscale" || value === "cloudflare" || value === "relay") return value;
  throw new CliHandledError("invalid_enum", `Invalid preview share mode "${value}". Allowed values: lan, tailscale, cloudflare, relay.`, CLI_EXIT_USAGE);
}

function resolvePreviewTargetUrl(flags: Record<string, string>): URL {
  const raw = flags.url?.trim() || (flags.port?.trim() ? `http://127.0.0.1:${flags.port.trim()}` : "");
  if (!raw) {
    throw new CliHandledError("usage_error", "--url or --port is required", CLI_EXIT_USAGE);
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new CliHandledError("usage_error", `Invalid preview URL: ${raw}`, CLI_EXIT_USAGE);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new CliHandledError("usage_error", "Preview URL must use http or https.", CLI_EXIT_USAGE);
  }
  return url;
}

function resolvePreviewShareTtlMs(flags: Record<string, string>): number {
  const parsed = parseSimpleDurationMs(flags.ttl || flags["expires-in"] || "30m");
  if (!parsed) {
    throw new CliHandledError("usage_error", "--ttl must use a duration like 15m, 1h, or 1d", CLI_EXIT_USAGE);
  }
  return parsed;
}

function resolveLanAdvertiseHost(flags: Record<string, string>): string {
  if (flags["advertise-host"]?.trim()) return flags["advertise-host"].trim();
  if (flags.host?.trim() && flags.host.trim() !== "0.0.0.0") return flags.host.trim();
  const interfaces = os.networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) return entry.address;
    }
  }
  return "127.0.0.1";
}

function appendQueryParam(url: string, key: string, value: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set(key, value);
  return parsed.toString();
}

function findExecutable(name: string, env = process.env): string | null {
  const pathValue = env.PATH ?? "";
  const extensions = process.platform === "win32" ? ["", ".exe", ".cmd", ".bat"] : [""];
  for (const dir of pathValue.split(path.delimiter).filter(Boolean)) {
    for (const extension of extensions) {
      const candidate = path.join(dir, `${name}${extension}`);
      try {
        fs.accessSync(candidate, fs.constants.X_OK);
        return candidate;
      } catch {
        // Try the next PATH entry.
      }
    }
  }
  return null;
}

async function probeHttpServer(url: URL): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2_000);
  try {
    const response = await fetch(url, { method: "GET", signal: controller.signal });
    return response.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function buildLanPreviewSharePayload(input: {
  targetUrl: URL;
  flags: Record<string, string>;
  token: string;
  expiresAt: Date;
  actualPort: number;
}): PreviewSharePayload {
  const tokenParam = input.flags["token-param"] || "claw_share_token";
  const host = resolveLanAdvertiseHost(input.flags);
  const shareUrl = appendQueryParam(`http://${host}:${input.actualPort}/`, tokenParam, input.token);
  return {
    ok: true,
    mode: "lan",
    targetUrl: input.targetUrl.toString(),
    shareUrl,
    token: input.token,
    tokenParam,
    expiresAt: input.expiresAt.toISOString(),
    qrPayload: shareUrl,
  };
}

async function pipePreviewProxyResponse(input: {
  targetUrl: URL;
  request: http.IncomingMessage;
  response: http.ServerResponse;
  token: string;
  tokenParam: string;
  expiresAtMs: number;
}): Promise<void> {
  const incomingUrl = new URL(input.request.url || "/", "http://127.0.0.1");
  if (incomingUrl.searchParams.get(input.tokenParam) !== input.token) {
    input.response.writeHead(401, { "content-type": "text/plain; charset=utf-8" });
    input.response.end("Invalid or missing share token.");
    return;
  }
  if (Date.now() > input.expiresAtMs) {
    input.response.writeHead(410, { "content-type": "text/plain; charset=utf-8" });
    input.response.end("Share token expired.");
    return;
  }

  incomingUrl.searchParams.delete(input.tokenParam);
  const target = new URL(input.targetUrl.toString());
  target.pathname = incomingUrl.pathname;
  target.search = incomingUrl.search;
  const headers = new Headers();
  for (const [key, value] of Object.entries(input.request.headers)) {
    if (key.toLowerCase() === "host" || value === undefined) continue;
    if (Array.isArray(value)) {
      for (const entry of value) headers.append(key, entry);
    } else {
      headers.set(key, value);
    }
  }
  const body = input.request.method === "GET" || input.request.method === "HEAD"
    ? undefined
    : input.request as unknown as BodyInit;
  try {
    const upstream = await fetch(target, {
      method: input.request.method,
      headers,
      body,
      redirect: "manual",
      duplex: body ? "half" : undefined,
    } as RequestInit & { duplex?: "half" });
    input.response.statusCode = upstream.status;
    upstream.headers.forEach((value, key) => {
      if (key.toLowerCase() !== "content-encoding") input.response.setHeader(key, value);
    });
    if (!upstream.body) {
      input.response.end();
      return;
    }
    const reader = upstream.body.getReader();
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      input.response.write(Buffer.from(chunk.value));
    }
    input.response.end();
  } catch (error) {
    input.response.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
    input.response.end(error instanceof Error ? error.message : "Preview proxy failed.");
  }
}

async function runLanPreviewShare(input: {
  targetUrl: URL;
  flags: Record<string, string>;
  stdout: NodeJS.WritableStream;
  wantsJson: boolean;
  dryRun: boolean;
}): Promise<number> {
  const serverReachable = await probeHttpServer(input.targetUrl);
  if (!serverReachable) {
    throw new CliHandledError("target_unreachable", `No local preview responded at ${input.targetUrl.toString()}`);
  }
  const ttlMs = resolvePreviewShareTtlMs(input.flags);
  const expiresAt = new Date(Date.now() + ttlMs);
  const token = input.flags.token || randomBytes(18).toString("base64url");
  const listenHost = input.flags.host || "0.0.0.0";
  const listenPort = Number(input.flags["share-port"] || input.flags["listen-port"] || "0");
  if (!Number.isInteger(listenPort) || listenPort < 0 || listenPort > 65535) {
    throw new CliHandledError("usage_error", "--share-port must be a valid TCP port.", CLI_EXIT_USAGE);
  }
  if (input.dryRun) {
    const payload = buildLanPreviewSharePayload({ targetUrl: input.targetUrl, flags: input.flags, token, expiresAt, actualPort: listenPort || Number(input.targetUrl.port || "80") });
    if (input.wantsJson) writeJson(input.stdout, payload);
    else input.stdout.write(`${payload.shareUrl}\n`);
    return CLI_EXIT_OK;
  }

  const tokenParam = input.flags["token-param"] || "claw_share_token";
  const expiresAtMs = expiresAt.getTime();
  const server = http.createServer((request, response) => {
    void pipePreviewProxyResponse({
      targetUrl: input.targetUrl,
      request,
      response,
      token,
      tokenParam,
      expiresAtMs,
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(listenPort, listenHost, () => resolve());
  });
  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : listenPort;
  const payload = buildLanPreviewSharePayload({ targetUrl: input.targetUrl, flags: input.flags, token, expiresAt, actualPort });
  if (input.wantsJson) writeJsonLine(input.stdout, payload);
  else input.stdout.write(`${payload.shareUrl}\n`);

  await new Promise<void>((resolve) => {
    const shutdown = () => {
      server.close(() => resolve());
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
    setTimeout(shutdown, ttlMs).unref();
  });
  return CLI_EXIT_OK;
}

function runTailscalePreviewShare(input: {
  targetUrl: URL;
  flags: Record<string, string>;
  stdout: NodeJS.WritableStream;
  wantsJson: boolean;
  dryRun: boolean;
}): number {
  const token = input.flags.token || randomBytes(18).toString("base64url");
  const tokenParam = input.flags["token-param"] || "claw_share_token";
  const expiresAt = new Date(Date.now() + resolvePreviewShareTtlMs(input.flags));
  const tailscaleBin = input.flags["tailscale-bin"] || findExecutable("tailscale");
  const port = input.targetUrl.port || (input.targetUrl.protocol === "https:" ? "443" : "80");
  const command = [tailscaleBin || "tailscale", "serve", "--bg", port];
  const baseShareUrl = input.flags["share-url"] || `https://<tailnet-device>/${input.targetUrl.pathname.replace(/^\//, "")}`;
  const payload: PreviewSharePayload = {
    ok: true,
    mode: "tailscale",
    targetUrl: input.targetUrl.toString(),
    shareUrl: appendQueryParam(baseShareUrl, tokenParam, token),
    token,
    tokenParam,
    expiresAt: expiresAt.toISOString(),
    qrPayload: appendQueryParam(baseShareUrl, tokenParam, token),
    provider: {
      available: Boolean(tailscaleBin),
      command,
      ...(!tailscaleBin ? { message: "tailscale is not installed or not on PATH." } : {}),
    },
  };
  if (!input.dryRun && tailscaleBin) {
    const result = spawnSync(tailscaleBin, ["serve", "--bg", port], { encoding: "utf8" });
    if (result.status !== 0) {
      throw new CliHandledError("provider_failed", result.stderr.trim() || "tailscale serve failed.");
    }
  }
  if (input.wantsJson) writeJson(input.stdout, payload);
  else input.stdout.write(`${payload.shareUrl}\n`);
  return CLI_EXIT_OK;
}

async function runCloudflarePreviewShare(input: {
  targetUrl: URL;
  flags: Record<string, string>;
  stdout: NodeJS.WritableStream;
  wantsJson: boolean;
  dryRun: boolean;
}): Promise<number> {
  const token = input.flags.token || randomBytes(18).toString("base64url");
  const tokenParam = input.flags["token-param"] || "claw_share_token";
  const expiresAt = new Date(Date.now() + resolvePreviewShareTtlMs(input.flags));
  const mockUrl = process.env.CLAW_PREVIEW_CLOUDFLARE_URL || input.flags["share-url"];
  const cloudflaredBin = input.flags["cloudflared-bin"] || findExecutable("cloudflared");
  const providerCommand = [cloudflaredBin || "cloudflared", "tunnel", "--url", input.targetUrl.toString()];
  if (input.dryRun || mockUrl) {
    const shareUrl = appendQueryParam(mockUrl || "https://<trycloudflare-preview>/", tokenParam, token);
    const payload: PreviewSharePayload = {
      ok: true,
      mode: "cloudflare",
      targetUrl: input.targetUrl.toString(),
      shareUrl,
      token,
      tokenParam,
      expiresAt: expiresAt.toISOString(),
      qrPayload: shareUrl,
      provider: {
        available: Boolean(cloudflaredBin || mockUrl),
        command: providerCommand,
        ...(!cloudflaredBin && !mockUrl ? { message: "cloudflared is not installed or not on PATH." } : {}),
      },
    };
    if (input.wantsJson) writeJson(input.stdout, payload);
    else input.stdout.write(`${payload.shareUrl}\n`);
    return CLI_EXIT_OK;
  }
  if (!cloudflaredBin) {
    throw new CliHandledError("provider_unavailable", "cloudflared is not installed or not on PATH.");
  }
  const child = spawn(cloudflaredBin, ["tunnel", "--url", input.targetUrl.toString()], {
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });
  let announced = false;
  const announce = (chunk: Buffer) => {
    const text = chunk.toString("utf8");
    const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
    if (!match || announced) return;
    announced = true;
    const shareUrl = appendQueryParam(match[0], tokenParam, token);
    const payload: PreviewSharePayload = {
      ok: true,
      mode: "cloudflare",
      targetUrl: input.targetUrl.toString(),
      shareUrl,
      token,
      tokenParam,
      expiresAt: expiresAt.toISOString(),
      qrPayload: shareUrl,
      provider: { available: true, command: providerCommand },
    };
    if (input.wantsJson) writeJsonLine(input.stdout, payload);
    else input.stdout.write(`${payload.shareUrl}\n`);
  };
  child.stdout?.on("data", announce);
  child.stderr?.on("data", announce);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      if (!announced) {
        child.kill("SIGTERM");
        reject(new CliHandledError("provider_failed", "cloudflared did not announce a public URL."));
      }
    }, 15_000);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    setTimeout(() => {
      child.kill("SIGTERM");
    }, resolvePreviewShareTtlMs(input.flags)).unref();
  });
  return announced ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
}

function parsePackageManager(value: string | undefined): SupportedPackageManager {
  if (!value || value === "npm") return "npm";
  if (value === "pnpm") return "pnpm";
  throw new CliHandledError("invalid_enum", `Invalid package manager "${value}". Allowed values: npm, pnpm.`, CLI_EXIT_USAGE);
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

function parseCodeListFlag(value: string | undefined): string[] {
  return value
    ? value.split(",").map((entry) => entry.trim()).filter(Boolean)
    : [];
}

function resolveCodeIntentId(positionals: string[], flags: Record<string, string>, index = 2): string {
  const id = flags.intent ?? flags["intent-id"] ?? flags.id ?? positionals[index];
  if (!id) throw new CliHandledError("usage_error", "A code intent id is required.", CLI_EXIT_USAGE);
  return id;
}

async function runCodeCli(input: {
  positionals: string[];
  flags: Record<string, string>;
  argv: string[];
  context: CliContext;
  wantsJson: boolean;
  binName: string;
}): Promise<number> {
  const [, command, subcommand] = input.positionals;
  const globalIndex = createCodeGlobalIndex({ rootDir: input.flags["code-home"] });
  const localLedger = () => createCodeLedger({ cwd: input.flags.repo || input.flags.workspace || input.context.cwd });
  const projectLedger = () => input.flags.project ? globalIndex.projectLedger(input.flags.project) : localLedger();
  const dryRun = readBooleanFlag(input.argv, input.flags, "dry-run", false);
  const wantsAll = readBooleanFlag(input.argv, input.flags, "all", false);

  try {
    if (command === "projects" && subcommand === "add") {
      const rootDir = input.positionals[3] ?? input.flags.path ?? input.flags.repo ?? input.flags.workspace;
      if (!rootDir) {
        input.context.stderr.write(`Usage: ${input.binName} code projects add <path> [--id ID] [--name NAME]\n`);
        return CLI_EXIT_USAGE;
      }
      const project = globalIndex.addProject({ rootDir, id: input.flags.id, name: input.flags.name });
      if (input.wantsJson) writeJson(input.context.stdout, { project });
      else input.context.stdout.write(`${project.id}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "projects" && subcommand === "discover") {
      const rootDir = input.positionals[3] ?? input.flags.path ?? input.context.cwd;
      const maxDepth = input.flags["max-depth"] ? Number(input.flags["max-depth"]) : undefined;
      const projects = globalIndex.discoverProjects({ rootDir, ...(maxDepth !== undefined ? { maxDepth } : {}) });
      if (input.wantsJson) writeJson(input.context.stdout, { projects });
      else input.context.stdout.write(formatCliTable(projects.map((project: { id: string; status: string; name: string; rootDir: string }) => ({
        id: project.id,
        status: project.status,
        name: project.name,
        root: project.rootDir,
      }))) + "\n");
      return CLI_EXIT_OK;
    }

    if (command === "projects" && subcommand === "list") {
      const projects = globalIndex.listProjects();
      if (input.wantsJson) writeJson(input.context.stdout, { projects });
      else input.context.stdout.write(formatCliTable(projects.map((project: { id: string; status: string; name: string; rootDir: string }) => ({
        id: project.id,
        status: project.status,
        name: project.name,
        root: project.rootDir,
      }))) + "\n");
      return CLI_EXIT_OK;
    }

    if (command === "projects" && subcommand === "show") {
      const projectId = input.positionals[3] ?? input.flags.project ?? input.flags.id;
      if (!projectId) {
        input.context.stderr.write(`Usage: ${input.binName} code projects show <project-id>\n`);
        return CLI_EXIT_USAGE;
      }
      const project = globalIndex.syncProject(projectId);
      if (input.wantsJson) writeJson(input.context.stdout, { project });
      else input.context.stdout.write(`${project.id} ${project.status} ${project.rootDir}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "projects" && subcommand === "remove") {
      const projectId = input.positionals[3] ?? input.flags.project ?? input.flags.id;
      if (!projectId) {
        input.context.stderr.write(`Usage: ${input.binName} code projects remove <project-id>\n`);
        return CLI_EXIT_USAGE;
      }
      const ok = globalIndex.removeProject(projectId);
      if (input.wantsJson) writeJson(input.context.stdout, { ok });
      else input.context.stdout.write(`${ok}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "agents" && subcommand === "register") {
      const agentId = input.positionals[3] ?? input.flags.agent ?? input.flags["agent-id"] ?? input.flags.id;
      if (!agentId) {
        input.context.stderr.write(`Usage: ${input.binName} code agents register <agent-id> [--project ID] [--intent ID]\n`);
        return CLI_EXIT_USAGE;
      }
      const agent = globalIndex.registerAgent({
        id: agentId,
        label: input.flags.label ?? input.flags.name,
        status: input.flags.status as never,
        projectId: input.flags.project ?? null,
        intentId: input.flags.intent ?? input.flags["intent-id"] ?? null,
        worktreePath: input.flags.worktree ?? input.flags["worktree-path"] ?? null,
      });
      if (input.wantsJson) writeJson(input.context.stdout, { agent });
      else input.context.stdout.write(`${agent.id}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "agents" && subcommand === "heartbeat") {
      const agentId = input.positionals[3] ?? input.flags.agent ?? input.flags["agent-id"] ?? input.flags.id;
      if (!agentId) {
        input.context.stderr.write(`Usage: ${input.binName} code agents heartbeat <agent-id> [--project ID] [--intent ID]\n`);
        return CLI_EXIT_USAGE;
      }
      const agent = globalIndex.heartbeatAgent({
        id: agentId,
        status: input.flags.status as never,
        projectId: input.flags.project ?? null,
        intentId: input.flags.intent ?? input.flags["intent-id"] ?? null,
        worktreePath: input.flags.worktree ?? input.flags["worktree-path"] ?? null,
      });
      if (input.wantsJson) writeJson(input.context.stdout, { agent });
      else input.context.stdout.write(`${agent.status}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "agents" && subcommand === "list") {
      const offlineAfterMs = input.flags["offline-after-ms"] ? Number(input.flags["offline-after-ms"]) : undefined;
      const agents = globalIndex.listAgents({ ...(offlineAfterMs !== undefined ? { offlineAfterMs } : {}) });
      if (input.wantsJson) writeJson(input.context.stdout, { agents });
      else input.context.stdout.write(formatCliTable(agents.map((agent: { id: string; status: string; projectId: string | null; intentId: string | null }) => ({
        id: agent.id,
        status: agent.status,
        project: agent.projectId ?? "",
        intent: agent.intentId ?? "",
      }))) + "\n");
      return CLI_EXIT_OK;
    }

    if (command === "agents" && subcommand === "show") {
      const agentId = input.positionals[3] ?? input.flags.agent ?? input.flags["agent-id"] ?? input.flags.id;
      if (!agentId) {
        input.context.stderr.write(`Usage: ${input.binName} code agents show <agent-id>\n`);
        return CLI_EXIT_USAGE;
      }
      const agent = globalIndex.requireAgent(agentId);
      if (input.wantsJson) writeJson(input.context.stdout, { agent });
      else input.context.stdout.write(`${agent.id} ${agent.status}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "serve") {
      const port = input.flags.port ? Number(input.flags.port) : 0;
      const server = await startCodeServer(globalIndex, { host: input.flags.host || "127.0.0.1", port });
      if (input.wantsJson) writeJsonLine(input.context.stdout, { ok: true, url: server.url });
      else input.context.stdout.write(`${server.url}\n`);
      await new Promise<void>((resolve) => {
        const stop = () => {
          void server.close().finally(resolve);
        };
        process.once("SIGINT", stop);
        process.once("SIGTERM", stop);
      });
      return CLI_EXIT_OK;
    }

    if (command === "init") {
      const ledger = projectLedger();
      const repository = ledger.init();
      if (input.flags.project) globalIndex.syncProject(input.flags.project);
      if (input.wantsJson) writeJson(input.context.stdout, { repository, databasePath: ledger.databasePath });
      else input.context.stdout.write(`${repository.id}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "policy" && (subcommand === "show" || subcommand === undefined)) {
      const policy = input.flags.project ? globalIndex.policy(input.flags.project) : localLedger().policy();
      if (input.wantsJson) writeJson(input.context.stdout, { policy });
      else input.context.stdout.write(`${policy.path}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "policy" && subcommand === "validate") {
      const policy = input.flags.project ? globalIndex.validatePolicy(input.flags.project) : localLedger().validatePolicy();
      if (input.wantsJson) writeJson(input.context.stdout, { ok: true, policy });
      else input.context.stdout.write("ok\n");
      return CLI_EXIT_OK;
    }

    if (command === "policy" && subcommand === "set") {
      const raw = input.flags["from-file"]
        ? readJsonFile<Record<string, unknown>>(path.resolve(input.context.cwd, input.flags["from-file"]), "--from-file")
        : parseJsonFlag<Record<string, unknown>>(input.flags["policy-json"] ?? input.flags.json, "--json");
      if (!raw) {
        input.context.stderr.write(`Usage: ${input.binName} code policy set [--project ID] --json TEXT\n`);
        return CLI_EXIT_USAGE;
      }
      const policy = input.flags.project ? globalIndex.setPolicy(input.flags.project, raw) : localLedger().setPolicy(raw);
      if (input.wantsJson) writeJson(input.context.stdout, { policy });
      else input.context.stdout.write(`${policy.path}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "status") {
      if (wantsAll) {
        const status = globalIndex.status();
        if (input.wantsJson) writeJson(input.context.stdout, status);
        else input.context.stdout.write(`${status.projects.length} projects, ${status.intents.length} intents, ${status.queued.length} queued\n`);
        return CLI_EXIT_OK;
      }
      if (input.flags.project) {
        const project = globalIndex.syncProject(input.flags.project);
        const status = project.status === "active" ? globalIndex.projectLedger(project.id).status() : { repository: project, intents: [], blocked: [], queued: [] };
        if (input.wantsJson) writeJson(input.context.stdout, { project, ...status });
        else input.context.stdout.write(`${project.id} ${project.status}\n`);
        return CLI_EXIT_OK;
      }
      const status = localLedger().status();
      if (input.wantsJson) writeJson(input.context.stdout, status);
      else input.context.stdout.write(`${status.intents.length} intents, ${status.queued.length} queued\n`);
      return CLI_EXIT_OK;
    }

    if (command === "list") {
      if (wantsAll || input.flags.project || input.flags["agent-id"]) {
        const intents = globalIndex.listIntents({
          ...(input.flags.project ? { projectId: input.flags.project } : {}),
          ...(input.flags["agent-id"] ? { agentId: input.flags["agent-id"] } : {}),
          ...(input.flags.status ? { status: input.flags.status as never } : {}),
        });
        if (input.wantsJson) writeJson(input.context.stdout, { intents });
        else input.context.stdout.write(formatCliTable(intents.map((intent: { projectId: string; id: string; status: string; kind: string; scope: string; title: string }) => ({
          project: intent.projectId,
          id: intent.id,
          status: intent.status,
          kind: intent.kind,
          scope: intent.scope,
          title: intent.title,
        }))) + "\n");
        return CLI_EXIT_OK;
      }
      const intents = localLedger().listIntents({ ...(input.flags.status ? { status: input.flags.status as never } : {}) });
      if (input.wantsJson) writeJson(input.context.stdout, { intents });
      else input.context.stdout.write(formatCliTable(intents.map((intent) => ({
        id: intent.id,
        status: intent.status,
        kind: intent.kind,
        scope: intent.scope,
        title: intent.title,
      }))) + "\n");
      return CLI_EXIT_OK;
    }

    if (command === "show") {
      const detail = input.flags.project
        ? globalIndex.showIntent(input.flags.project, resolveCodeIntentId(input.positionals, input.flags))
        : localLedger().showIntent(resolveCodeIntentId(input.positionals, input.flags));
      if (input.wantsJson) writeJson(input.context.stdout, detail);
      else input.context.stdout.write(`${detail.intent.id} ${detail.intent.status} ${detail.intent.branch}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "start") {
      const kind = input.flags.kind;
      const scope = input.flags.scope;
      const title = input.flags.title ?? joinedPositionals(input.positionals, 2);
      if (!kind || !scope || !title) {
        input.context.stderr.write(`Usage: ${input.binName} code start --kind fix|feat|refactor|docs|test|chore --scope SCOPE --title TEXT\n`);
        return CLI_EXIT_USAGE;
      }
      const startInput = {
        kind: kind as never,
        scope,
        title,
        ...(input.flags.summary ? { summary: input.flags.summary } : {}),
        ...(input.flags.risk ? { risk: input.flags.risk as never } : {}),
        ...(input.flags["agent-id"] ? { agentId: input.flags["agent-id"] } : {}),
        ...(input.flags.base ? { baseBranch: input.flags.base } : {}),
        paths: [...parseCodeListFlag(input.flags.path), ...parseCodeListFlag(input.flags.paths)],
      };
      const detail = input.flags.project
        ? globalIndex.startIntent(input.flags.project, startInput)
        : localLedger().start(startInput);
      if (input.wantsJson) writeJson(input.context.stdout, detail);
      else input.context.stdout.write(`${detail.intent.id}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "reserve") {
      const ledger = projectLedger();
      const reservations = ledger.reserve({
        intentId: resolveCodeIntentId(input.positionals, input.flags),
        scopes: parseCodeListFlag(input.flags.scope ?? input.flags.scopes),
        paths: [...parseCodeListFlag(input.flags.path), ...parseCodeListFlag(input.flags.paths)],
      });
      if (input.flags.project) globalIndex.syncProject(input.flags.project);
      if (input.wantsJson) writeJson(input.context.stdout, { reservations });
      else input.context.stdout.write(`${reservations.length}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "evidence" && subcommand === "add") {
      const label = input.flags.label ?? input.flags.title ?? joinedPositionals(input.positionals, 3);
      if (!label) {
        input.context.stderr.write(`Usage: ${input.binName} code evidence add --intent ID --label TEXT [--path PATH|--url URL]\n`);
        return CLI_EXIT_USAGE;
      }
      const evidence = input.flags.project ? globalIndex.addEvidence(input.flags.project, {
        intentId: resolveCodeIntentId(input.positionals, input.flags, 3),
        label,
        ...(input.flags.kind ? { kind: input.flags.kind } : {}),
        ...(input.flags.path ? { path: input.flags.path } : {}),
        ...(input.flags.url ? { url: input.flags.url } : {}),
      }) : localLedger().addEvidence({
        intentId: resolveCodeIntentId(input.positionals, input.flags, 3),
        label,
        ...(input.flags.kind ? { kind: input.flags.kind } : {}),
        ...(input.flags.path ? { path: input.flags.path } : {}),
        ...(input.flags.url ? { url: input.flags.url } : {}),
      });
      if (input.wantsJson) writeJson(input.context.stdout, { evidence });
      else input.context.stdout.write(`${evidence.id}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "check" && subcommand === "record") {
      const name = input.flags.name ?? input.flags.check ?? "check";
      const status = input.flags.status;
      if (status !== "passed" && status !== "failed") {
        input.context.stderr.write(`Usage: ${input.binName} code check record --intent ID --name NAME --status passed|failed\n`);
        return CLI_EXIT_USAGE;
      }
      const checkInput = {
        intentId: resolveCodeIntentId(input.positionals, input.flags, 3),
        name,
        status: status as "passed" | "failed",
        ...(input.flags.command ? { command: input.flags.command } : {}),
        ...(input.flags.output ? { output: input.flags.output } : {}),
      };
      const check = input.flags.project
        ? globalIndex.recordCheck(input.flags.project, checkInput)
        : localLedger().recordCheck(checkInput);
      if (input.wantsJson) writeJson(input.context.stdout, { check });
      else input.context.stdout.write(`${check.id}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "check" && subcommand === "run") {
      const name = input.flags.name ?? input.flags.check ?? "check";
      const commandText = input.flags.command ?? joinedPositionals(input.positionals, 3);
      if (!commandText) {
        input.context.stderr.write(`Usage: ${input.binName} code check run --intent ID --name NAME --command COMMAND\n`);
        return CLI_EXIT_USAGE;
      }
      const checkInput = {
        intentId: resolveCodeIntentId(input.positionals, input.flags, 3),
        name,
        command: commandText,
      };
      const check = input.flags.project
        ? globalIndex.runCheck(input.flags.project, checkInput)
        : localLedger().runCheck(checkInput);
      if (input.wantsJson) writeJson(input.context.stdout, { check });
      else input.context.stdout.write(`${check.status}\n`);
      return check.status === "passed" ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
    }

    if (command === "commit") {
      const result = input.flags.project
        ? globalIndex.commit(input.flags.project, resolveCodeIntentId(input.positionals, input.flags))
        : localLedger().commit(resolveCodeIntentId(input.positionals, input.flags));
      if (input.wantsJson) writeJson(input.context.stdout, result);
      else input.context.stdout.write(`${result.commitSha}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "review" && (subcommand === "approve" || subcommand === "reject")) {
      const reviewInput = {
        intentId: resolveCodeIntentId(input.positionals, input.flags, 3),
        reviewer: input.flags.reviewer ?? input.flags["agent-id"] ?? "operator",
        decision: (subcommand === "approve" ? "approved" : "rejected") as "approved" | "rejected",
        ...(input.flags.reason ? { reason: input.flags.reason } : {}),
      };
      const review = input.flags.project
        ? globalIndex.review(input.flags.project, reviewInput)
        : localLedger().review(reviewInput);
      if (input.wantsJson) writeJson(input.context.stdout, { review });
      else input.context.stdout.write(`${review.id}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "gate") {
      const gate = input.flags.project
        ? globalIndex.gate(input.flags.project, resolveCodeIntentId(input.positionals, input.flags))
        : localLedger().gate(resolveCodeIntentId(input.positionals, input.flags));
      if (input.wantsJson) writeJson(input.context.stdout, { gate });
      else input.context.stdout.write(`${gate.status}${gate.reasons.length > 0 ? ` ${gate.reasons.join("; ")}` : ""}\n`);
      return gate.status === "passed" ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
    }

    if (command === "queue") {
      if (wantsAll) {
        const queue = globalIndex.listQueue(input.flags.project);
        if (input.wantsJson) writeJson(input.context.stdout, { queue });
        else input.context.stdout.write(formatCliTable(queue.map((entry: { projectId: string; intentId: string; status: string }) => ({
          project: entry.projectId,
          intent: entry.intentId,
          status: entry.status,
        }))) + "\n");
        return CLI_EXIT_OK;
      }
      const queue = input.flags.project
        ? globalIndex.queueIntent(input.flags.project, resolveCodeIntentId(input.positionals, input.flags))
        : localLedger().queue(resolveCodeIntentId(input.positionals, input.flags));
      if (input.wantsJson) writeJson(input.context.stdout, { queue });
      else input.context.stdout.write(`${queue.status}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "integrate") {
      const result = input.flags.project
        ? globalIndex.integrateIntent(input.flags.project, resolveCodeIntentId(input.positionals, input.flags))
        : localLedger().integrate(resolveCodeIntentId(input.positionals, input.flags));
      if (input.wantsJson) writeJson(input.context.stdout, result);
      else input.context.stdout.write(`${result.integrationSha}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "sync" && subcommand === "github") {
      const syncInput = {
        intentId: resolveCodeIntentId(input.positionals, input.flags, 3),
        dryRun,
        ...(input.flags.repo ? { repo: input.flags.repo } : {}),
        ...(input.flags.base ? { base: input.flags.base } : {}),
      };
      const sync = input.flags.project
        ? globalIndex.syncGithub(input.flags.project, syncInput)
        : localLedger().syncGithub(syncInput);
      if (input.wantsJson) writeJson(input.context.stdout, { sync });
      else input.context.stdout.write(`${sync.remoteUrl ?? sync.status}\n`);
      return sync.status === "failed" ? CLI_EXIT_FAILURE : CLI_EXIT_OK;
    }

    input.context.stderr.write(`Usage: ${input.binName} code init|projects|agents|policy|start|status|list|show|reserve|evidence add|check run|check record|commit|review approve|review reject|gate|queue|integrate|sync github|serve\n`);
    return CLI_EXIT_USAGE;
  } catch (error) {
    const handled = cliErrorFromUnknown(error);
    if (input.wantsJson) writeCliError(input.context.stdout, handled);
    else input.context.stderr.write(`${handled.message}\n`);
    return handled.exitCode;
  }
}

function registerGeneratedSkillInLibrary(input: {
  id: string;
  title: string;
  sourcePath: string;
  flags: Record<string, string>;
}): void {
  const store = createLocalLibraryStore({ rootDir: input.flags["library-dir"] });
  const assetId = normalizeLibraryId(input.id, "skill");
  const existing = store.get(assetId);
  const payload = {
    title: input.title,
    source: {
      source: "local",
      path: input.sourcePath,
    },
  };
  if (existing) {
    store.update(assetId, payload);
    return;
  }
  store.create({
    id: assetId,
    kind: "skill",
    title: input.title,
    tags: parseCsvFlag(input.flags.tags),
    source: payload.source,
  });
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

async function runCliUnsafe(argv: string[], context: CliContext): Promise<number> {
  const binName = context.binName?.trim() || DEFAULT_CLI_BIN;
  argv = normalizePublicCliArgv(argv, context.stderr, binName);
  const positionals = extractPositionals(argv);
  const [group, command, subcommand] = positionals;
  const wantsJson = argv.includes("--json");
  const flags = parseFlags(argv);
  const usage = buildCliUsage(binName, { all: argv.includes("--all") });
  const wantsHelp = argv.includes("--help") || argv.includes("-h");

  const removedMessage = group ? removedPublicCommandMessage(group, binName) : null;
  if (removedMessage) {
    context.stderr.write(`${removedMessage}\n`);
    return CLI_EXIT_USAGE;
  }

  if (group === "runtime" && command && REMOVED_RUNTIME_COMMANDS.has(command)) {
    context.stderr.write(`\`${binName} runtime ${command}\` is not part of the public Claw CLI surface. Runtime is limited to adapters and setup.\n`);
    return CLI_EXIT_USAGE;
  }

  if ((group === "business" || group === "social") && command && REMOVED_V1_CRUD_COMMANDS.has(command)) {
    context.stderr.write(`\`${binName} ${group} ${command}\` is legacy V1 CRUD and is not part of the public Claw CLI surface. Use the ${group} portal help to pick a supported route.\n`);
    return CLI_EXIT_USAGE;
  }

  if (group === "content" && command && REMOVED_V1_CRUD_COMMANDS.has(command)) {
    context.stderr.write(`\`${binName} content ${command}\` is legacy V1 CRUD and is not part of the public Claw CLI surface. Use posts, campaigns, publications, or content service commands.\n`);
    return CLI_EXIT_USAGE;
  }

  if (wantsHelp || group === "help") {
    if (!group || group === "help") {
      context.stdout.write(`${usage}\n`);
      return CLI_EXIT_OK;
    }
    const commandHelp = buildCommandHelp(binName, group);
    context.stdout.write(`${commandHelp ?? usage}\n`);
    return CLI_EXIT_OK;
  }

  if (group === "__open-server") {
    return await runOpenServerCommand({ positionals, flags, context });
  }

  if (group === "open") {
    return await runOpenCli({ argv, positionals, flags, context, wantsJson, binName });
  }

  if (group === "inspect") {
    return await runInspectCli({ positionals, flags, context, wantsJson, binName });
  }

  if (group === "domains") {
    return await runDomainsCli({ argv, positionals, flags, context, wantsJson, binName });
  }

  if (group === "host" && command === "domains") {
    return await runDomainsCli({ argv: ["domains", ...argv.slice(2)], positionals: ["domains", ...positionals.slice(2)], flags, context, wantsJson, binName });
  }

  if (group === "host" && (command === "services" || command === "permissions" || command === "capabilities")) {
    return await runHostForwardCli({
      domain: "system",
      resource: command,
      action: subcommand || "list",
      flags,
      context,
      wantsJson,
    });
  }

  if (group === "host") {
    return await runHostCli({ argv, positionals, flags, context, wantsJson, binName });
  }

  if (group === "system" && command === "capabilities") {
    return await runSystemCapabilitiesCli({ positionals, flags, context, wantsJson, binName });
  }

  if (group === "collections" || group === "records") {
    return await runCliUnsafe(["db", ...argv.slice(1)], context);
  }

  if (group === "content" && (command === "posts" || command === "campaigns" || command === "publications")) {
    const contentGroup = command === "posts" ? "entry" : command === "campaigns" ? "campaign" : "publish";
    const contentCommand = command === "publications" ? (!subcommand || subcommand === "list" ? "runs" : subcommand) : (subcommand ?? "list");
    const passthrough = subcommand ? argv.slice(3) : argv.slice(2);
    return await runDelegatedContentCli(["content", contentGroup, contentCommand, ...passthrough], flags, context);
  }

  if (group === "diagnostics") {
    return await runCliUnsafe(["doctor", ...argv.slice(1)], context);
  }

  if (group && PUBLIC_PORTAL_HELP_ONLY.has(group)) {
    const commandHelp = buildCommandHelp(binName, group);
    context.stderr.write(`${commandHelp ?? usage}\n`);
    return CLI_EXIT_USAGE;
  }

  if (group === "chat") {
    return await runChatCli({ argv, positionals, flags, wantsJson, context: { stdout: context.stdout, stderr: context.stderr, cwd: context.cwd, binName } });
  }

  if (group === "provider") {
    return await runProviderCli({ argv, positionals, flags, wantsJson, context: { stdout: context.stdout, stderr: context.stderr, cwd: context.cwd, binName } });
  }

  if (group === "database" && wantsHelp) {
    try {
      return await runDelegatedDatabaseCli(argv, flags, context);
    } catch (error) {
      const handled = cliErrorFromUnknown(error);
      if (wantsJson) writeCliError(context.stdout, handled);
      else context.stderr.write(`${handled.message}\n`);
      return handled.exitCode;
    }
  }

  if (group === "db" && wantsHelp) {
    return await runMagicDbCli({
      argv,
      positionals,
      flags,
      workspaceRoot: flags.workspace || context.cwd,
      stdout: context.stdout,
      stderr: context.stderr,
      wantsJson,
      binName,
    });
  }

  if (group === "memory") {
    const memoryWorkspaceRoot = flags.workspace || context.cwd;
    const memoryWorkspaceId = flags["workspace-id"] || pathSafeBasename(memoryWorkspaceRoot);
    const memoryAgentId = flags["agent-id"] || memoryWorkspaceId;
    const memoryRuntimeAdapterId = resolveRuntimeAdapterId(flags);
    return await runMemoryCli({
      argv,
      positionals,
      flags,
      workspaceRoot: memoryWorkspaceRoot,
      workspaceId: memoryWorkspaceId,
      agentId: memoryAgentId,
      stdout: context.stdout,
      stderr: context.stderr,
      wantsJson,
      binName,
      runtime: {
        list: async () => {
          const claw = await createCliClaw(memoryRuntimeAdapterId, flags, memoryWorkspaceRoot, flags["app-id"] || "clawjs-app", memoryWorkspaceId, memoryAgentId);
          return await claw.memory.list();
        },
        search: async (query) => {
          const claw = await createCliClaw(memoryRuntimeAdapterId, flags, memoryWorkspaceRoot, flags["app-id"] || "clawjs-app", memoryWorkspaceId, memoryAgentId);
          return await claw.memory.search(query);
        },
      },
    });
  }

  if (group === "code") {
    return await runCodeCli({ positionals, flags, argv, context, wantsJson, binName });
  }

  if (group === "search" && command === "query") {
    const query = subcommand || flags.query;
    if (!query) {
      context.stderr.write(`Usage: ${binName} search query <query> [--domains tasks,notes,...]\n`);
      return CLI_EXIT_USAGE;
    }
    const searchWorkspaceRoot = flags.workspace || context.cwd;
    const claw = await createCliWorkspaceClaw(
      resolveRuntimeAdapterId(flags),
      flags,
      searchWorkspaceRoot,
      flags["app-id"] || "clawjs-app",
      flags["workspace-id"] || pathSafeBasename(searchWorkspaceRoot),
      flags["agent-id"] || flags["workspace-id"] || pathSafeBasename(searchWorkspaceRoot),
      context.cwd,
    );
    const results = await claw.search.query({
      query,
      domains: parseCsvFlag(flags.domains) as Array<"areas" | "tasks" | "goals" | "projects" | "milestones" | "activity" | "blockers" | "artifacts" | "decisions" | "work_sessions" | "assignments" | "handoffs" | "approvals" | "capacity" | "reminders" | "deadlines" | "notes" | "people" | "inbox" | "events">,
      strategy: flags.strategy as "auto" | "keyword" | "semantic" | "hybrid" | undefined,
      ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      includeArchived: readBooleanFlag(argv, flags, "include-archived", false),
    });
    if (wantsJson) writeJson(context.stdout, results);
    else context.stdout.write(`${results.map((result) => `${result.domain} ${result.score.toFixed(1)} ${result.id} ${result.title}`).join("\n")}\n`);
    return results.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "search" && command === "rebuild") {
    const searchWorkspaceRoot = flags.workspace || context.cwd;
    const claw = await createCliWorkspaceClaw(
      resolveRuntimeAdapterId(flags),
      flags,
      searchWorkspaceRoot,
      flags["app-id"] || "clawjs-app",
      flags["workspace-id"] || pathSafeBasename(searchWorkspaceRoot),
      flags["agent-id"] || flags["workspace-id"] || pathSafeBasename(searchWorkspaceRoot),
      context.cwd,
    );
    const result = await claw.workspaceIndex.rebuild();
    if (wantsJson) writeJson(context.stdout, result);
    else context.stdout.write(`reindexed=${result.reindexed} embeddings=${result.embeddings}\n`);
    return CLI_EXIT_OK;
  }

  {
    const v1DataExitCode = await runV1DataCli({
      argv,
      positionals,
      flags,
      stdout: context.stdout,
      stderr: context.stderr,
      wantsJson,
      binName,
      cwd: context.cwd,
    });
    if (v1DataExitCode !== null) return v1DataExitCode;
  }

  const removedPublicCommand = group ? removedPublicCommandMessage(group, binName) : null;
  if (removedPublicCommand) {
    throw new CliHandledError("removed_public_command", removedPublicCommand, CLI_EXIT_USAGE);
  }

  if (group === "runtime" && command && REMOVED_RUNTIME_COMMANDS.has(command)) {
    throw new CliHandledError(
      "removed_public_command",
      `\`${binName} runtime ${command}\` is not part of the public Claw CLI surface. Runtime is limited to adapter setup/status/install/uninstall/repair.`,
      CLI_EXIT_USAGE,
    );
  }

  if ((group === "business" || group === "social") && command && REMOVED_V1_CRUD_COMMANDS.has(command)) {
    throw new CliHandledError(
      "removed_public_command",
      `\`${binName} ${group} ${command}\` was v1 CRUD and is not part of the public Claw CLI surface. Use \`${binName} ${group} --help\` for the portal.`,
      CLI_EXIT_USAGE,
    );
  }

  if (group === "content" && command && REMOVED_V1_CRUD_COMMANDS.has(command)) {
    throw new CliHandledError(
      "removed_public_command",
      `\`${binName} content ${command}\` was v1 CRUD and is not part of the public Claw CLI surface. Use posts, campaigns, publications or the content service commands.`,
      CLI_EXIT_USAGE,
    );
  }

  if (group === "capabilities") {
    return await runSystemCapabilitiesCli({ positionals: ["system", "capabilities", command ?? "list", ...positionals.slice(2)], flags, context, wantsJson, binName });
  }

  if (group === "permissions") {
    return await runHostForwardCli({
      domain: "system",
      resource: "permissions",
      action: command ?? "list",
      flags,
      context,
      wantsJson,
      extraArguments: {
        ...(subcommand ? { subject: subcommand } : {}),
      },
    });
  }

  if (group === "diagnostics") {
    return await runCliUnsafe(["doctor", ...argv.slice(1)], context);
  }

  if (wantsHelp && group) {
    const commandHelp = buildCommandHelp(binName, group);
    if (commandHelp) {
      context.stdout.write(`${commandHelp}\n`);
      return CLI_EXIT_OK;
    }
  }

  assertAllowedLocalFlags(group, argv);

  if (group === "database") {
    try {
      return await runDelegatedDatabaseCli(argv, flags, context);
    } catch (error) {
      const handled = cliErrorFromUnknown(error);
      if (wantsJson) writeCliError(context.stdout, handled);
      else context.stderr.write(`${handled.message}\n`);
      return handled.exitCode;
    }
  }

  if (group === "db") {
    const dbWorkspaceRoot = flags.workspace || context.cwd;
    const dbCollection = coreProductivityCollection(positionals[1]);
    if (dbCollection && !flags.url) {
      return await runCoreProductivityDbCli({
        argv,
        positionals,
        flags,
        workspaceRoot: dbWorkspaceRoot,
        stdout: context.stdout,
        stderr: context.stderr,
        wantsJson,
        appId: flags["app-id"] || "clawjs-app",
        workspaceId: flags["workspace-id"] || pathSafeBasename(dbWorkspaceRoot),
        agentId: flags["agent-id"] || flags["workspace-id"] || pathSafeBasename(dbWorkspaceRoot),
        contextCwd: context.cwd,
      });
    }
    return await runMagicDbCli({
      argv,
      positionals,
      flags,
      workspaceRoot: dbWorkspaceRoot,
      stdout: context.stdout,
      stderr: context.stderr,
      wantsJson,
      binName,
    });
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

  if (group === "slides") {
    try {
      return await runSlidesCli({
        argv,
        positionals,
        flags,
        workspaceRoot,
        agentId,
        wantsJson,
        context: {
          stdout: context.stdout,
          stderr: context.stderr,
          cwd: context.cwd,
          binName,
        },
        registerOutput: async (input) => {
          const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId) as CliMediaClaw;
          const media = claw.media.register({
            name: input.name,
            mimeType: input.mimeType,
            kind: input.kind,
            filePath: input.filePath,
            origin: "generated",
            direction: "outbound",
            workspaceId,
            agentId,
            sourceText: input.sourceText,
            metadata: { feature: "slides" },
          });
          return { mediaId: media.mediaId };
        },
        createMediaShare: async (input) => {
          const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId) as CliMediaClaw;
          return await claw.media.share.create(input);
        },
      });
    } catch (error) {
      const handled = cliErrorFromUnknown(error);
      if (wantsJson) writeCliError(context.stdout, handled);
      else context.stderr.write(`${handled.message}\n`);
      return handled.exitCode;
    }
  }

  if (group === "style") {
    try {
      return await runStyleCli({
        argv,
        positionals,
        flags,
        workspaceRoot,
        wantsJson,
        context: {
          stdout: context.stdout,
          stderr: context.stderr,
          cwd: context.cwd,
          binName,
        },
      });
    } catch (error) {
      const handled = cliErrorFromUnknown(error);
      if (wantsJson) writeCliError(context.stdout, handled);
      else context.stderr.write(`${handled.message}\n`);
      return handled.exitCode;
    }
  }

  if (group === "template") {
    try {
      return await runTemplateCli({
        argv,
        positionals,
        flags,
        workspaceRoot,
        wantsJson,
        context: {
          stdout: context.stdout,
          stderr: context.stderr,
          cwd: context.cwd,
          binName,
        },
      });
    } catch (error) {
      const handled = cliErrorFromUnknown(error);
      if (wantsJson) writeCliError(context.stdout, handled);
      else context.stderr.write(`${handled.message}\n`);
      return handled.exitCode;
    }
  }

  if (group === "ref") {
    try {
      return await runReferenceCli({
        argv,
        positionals,
        flags,
        workspaceRoot,
        wantsJson,
        context: {
          stdout: context.stdout,
          stderr: context.stderr,
          cwd: context.cwd,
          binName,
        },
      });
    } catch (error) {
      const handled = cliErrorFromUnknown(error);
      if (wantsJson) writeCliError(context.stdout, handled);
      else context.stderr.write(`${handled.message}\n`);
      return handled.exitCode;
    }
  }

  if (group === "plan") {
    const state = readAgentPlanState(workspaceRoot);
    const save = () => writeAgentPlanState(workspaceRoot, state);
    const findPlan = (id: string | undefined): AgentPlanRecord => {
      const plan = state.plans.find((candidate) => candidate.id === id);
      if (!plan) throw new CliHandledError("not_found", `Plan not found: ${id ?? ""}`, CLI_EXIT_FAILURE);
      return plan;
    };

    if (command === "create") {
      const objective = joinedPositionals(positionals, 2) ?? flags.objective ?? flags.title;
      if (!objective) {
        context.stderr.write(`Usage: ${binName} plan create "Objective" [--agent ID] [--tags a,b] [--from-file plan.json]\n`);
        return CLI_EXIT_USAGE;
      }
      const creatorAgentId = flags.agent ?? flags["agent-id"] ?? agentId;
      const tags = parseCsvFlag(flags.tags);
      const fromFile = flags["from-file"];
      const parsedFile = fromFile ? readJsonFile<unknown>(path.resolve(context.cwd, fromFile), "--from-file") : null;
      const semanticPlan = semanticPlanSchema.parse(
        parsedFile && typeof parsedFile === "object" && !Array.isArray(parsedFile) && "semanticPlan" in parsedFile
          ? (parsedFile as { semanticPlan: unknown }).semanticPlan
          : parsedFile ?? buildFallbackSemanticPlan(objective, creatorAgentId, tags),
      );
      const timestamp = nowIso();
      const policy = evaluatePlanPolicy(state.policies, semanticPlan, { creatorAgentId, tags });
      const plan: AgentPlanRecord = {
        schemaVersion: 1,
        id: flags.id ?? planId(),
        objective,
        status: statusFromDecision(policy.decision),
        creatorAgentId,
        ...(flags.executor ? { executorAgentId: flags.executor } : {}),
        ...(policy.approverAgentId ? { approverAgentId: policy.approverAgentId } : {}),
        ...(policy.reviewerAgentId ? { reviewerAgentId: policy.reviewerAgentId } : {}),
        tags,
        semanticPlan,
        policyDecision: policy.decision,
        ...(policy.ruleId ? { policyRuleId: policy.ruleId } : {}),
        policyReason: policy.reason,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      state.plans.unshift(plan);
      save();
      if (policy.decision === "auto_run" && !readBooleanFlag(argv, flags, "no-auto-run", false)) {
        try {
          plan.delegationGraphId = await createDelegationGraphForPlan(plan, flags);
          plan.status = "running";
          plan.updatedAt = nowIso();
          save();
        } catch (error) {
          plan.lastRunError = error instanceof Error ? error.message : String(error);
          plan.updatedAt = nowIso();
          save();
        }
      }
      if (wantsJson) writeJson(context.stdout, { plan });
      else context.stdout.write(`${plan.id} ${plan.status}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "list") {
      const filtered = state.plans
        .filter((plan) => !flags.status || plan.status === flags.status)
        .filter((plan) => !flags.agent || plan.creatorAgentId === flags.agent || plan.executorAgentId === flags.agent || plan.reviewerAgentId === flags.agent)
        .filter((plan) => !flags.tags || parseCsvFlag(flags.tags).every((tag) => plan.tags.includes(tag)));
      if (wantsJson) writeJson(context.stdout, { plans: filtered });
      else context.stdout.write(`${filtered.map((plan) => `${plan.id}\t${plan.status}\t${plan.objective}`).join("\n")}${filtered.length ? "\n" : ""}`);
      return CLI_EXIT_OK;
    }

    if (command === "show") {
      const plan = findPlan(subcommand ?? flags.id);
      if (wantsJson) writeJson(context.stdout, { plan });
      else context.stdout.write(`${formatPlan(plan)}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "approve" || command === "reject") {
      const plan = findPlan(subcommand ?? flags.id);
      plan.status = command === "approve" ? "approved" : "rejected";
      plan.policyDecision = command === "approve" ? "auto_run" : "block";
      plan.decisionReason = flags.reason ?? (command === "approve" ? "Approved manually." : "Rejected manually.");
      plan.updatedAt = nowIso();
      save();
      if (wantsJson) writeJson(context.stdout, { plan });
      else context.stdout.write(`${plan.id} ${plan.status}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "review") {
      const plan = findPlan(subcommand ?? flags.id);
      const reviewerAgentId = flags.agent ?? plan.reviewerAgentId;
      if (!reviewerAgentId) {
        context.stderr.write(`Usage: ${binName} plan review <planId> --agent AGENT [--decision approve|reject]\n`);
        return CLI_EXIT_USAGE;
      }
      const decision = flags.decision === "reject" ? "reject" : "approve";
      plan.reviewerAgentId = reviewerAgentId;
      plan.reviewReason = flags.reason ?? `${reviewerAgentId} ${decision}d this plan.`;
      plan.status = decision === "approve" ? "approved" : "rejected";
      plan.policyDecision = decision === "approve" ? "auto_run" : "block";
      plan.updatedAt = nowIso();
      save();
      if (wantsJson) writeJson(context.stdout, { plan, review: { decision, reason: plan.reviewReason } });
      else context.stdout.write(`${plan.id} ${plan.status}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "run") {
      const plan = findPlan(subcommand ?? flags.id);
      if (plan.status !== "approved" && plan.status !== "running") {
        throw new CliHandledError("plan_not_authorized", `Plan ${plan.id} is ${plan.status}; approve or review it before running.`, CLI_EXIT_FAILURE);
      }
      if (!plan.delegationGraphId) {
        plan.delegationGraphId = await createDelegationGraphForPlan(plan, flags);
      }
      plan.status = "running";
      plan.updatedAt = nowIso();
      save();
      if (wantsJson) writeJson(context.stdout, { plan });
      else context.stdout.write(`${plan.id} running ${plan.delegationGraphId}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "complete" || command === "fail" || command === "cancel") {
      const plan = findPlan(subcommand ?? flags.id);
      plan.status = command === "complete" ? "succeeded" : command === "fail" ? "failed" : "cancelled";
      plan.completedAt = nowIso();
      plan.updatedAt = plan.completedAt;
      plan.decisionReason = flags.reason ?? plan.decisionReason;
      save();
      if (wantsJson) writeJson(context.stdout, { plan });
      else context.stdout.write(`${plan.id} ${plan.status}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "policy" && subcommand === "list") {
      if (wantsJson) writeJson(context.stdout, { policies: state.policies });
      else context.stdout.write(`${state.policies.map((policy) => `${policy.id}\t${policy.then.decision}`).join("\n")}${state.policies.length ? "\n" : ""}`);
      return CLI_EXIT_OK;
    }

    if (command === "policy" && subcommand === "add") {
      const raw = flags["from-file"]
        ? readJsonFile<unknown>(path.resolve(context.cwd, flags["from-file"]), "--from-file")
        : {
            id: flags.id,
            when: parseJsonFlag<Record<string, unknown>>(flags["when-json"], "--when-json"),
            then: parseJsonFlag<AgentPlanPolicyRule["then"]>(flags["then-json"], "--then-json"),
          };
      const rule = raw as AgentPlanPolicyRule;
      if (!rule.id || !rule.when || !rule.then?.decision) {
        throw new CliHandledError("usage_error", "Policy requires id, when, and then.decision.", CLI_EXIT_USAGE);
      }
      state.policies = [rule, ...state.policies.filter((policy) => policy.id !== rule.id)];
      save();
      if (wantsJson) writeJson(context.stdout, { policy: rule });
      else context.stdout.write(`${rule.id}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "policy" && subcommand === "remove") {
      const id = positionals[3] ?? flags.id;
      state.policies = state.policies.filter((policy) => policy.id !== id);
      save();
      if (wantsJson) writeJson(context.stdout, { ok: true, id });
      else context.stdout.write(`${id}\n`);
      return CLI_EXIT_OK;
    }

    if (command === "policy" && subcommand === "test") {
      const plan = findPlan(positionals[3] ?? flags.id);
      const decision = evaluatePlanPolicy(state.policies, plan.semanticPlan, { creatorAgentId: plan.creatorAgentId, tags: plan.tags });
      if (wantsJson) writeJson(context.stdout, decision);
      else context.stdout.write(`${decision.decision}: ${decision.reason}\n`);
      return CLI_EXIT_OK;
    }

    context.stderr.write(`Usage: ${binName} plan create|list|show|run|approve|reject|review|complete|fail|cancel|policy\n`);
    return CLI_EXIT_USAGE;
  }

  async function getTypedGenerationFacade(kind: GenerationCliMediaKind) {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, argv);
    switch (kind) {
      case "image":
        return { claw, media: claw.image };
      case "audio":
        return { claw, media: claw.audio };
      case "video":
        return { claw, media: claw.video };
    }
  }

  async function getImageGenerationFacade(): Promise<{ claw: ClawInstance; media: ClawInstance["image"] }> {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, argv);
    return { claw, media: claw.image };
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
      const scaffoldContext = wantsJson ? { ...context, stdout: context.stderr } : context;
      await scaffoldProject({
        context: scaffoldContext,
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
      let libraryAsset: unknown;
      if (type === "skill" && !argv.includes("--no-library")) {
        registerGeneratedSkillInLibrary({
          id: slug,
          title,
          sourcePath: targetPath,
          flags,
        });
        libraryAsset = { id: slug, path: targetPath };
      }
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
          ...(libraryAsset ? { libraryAsset } : {}),
        });
      }
      return CLI_EXIT_OK;
    } catch (error) {
      const handled = cliErrorFromUnknown(error);
      if (wantsJson) writeCliError(context.stdout, handled);
      else context.stderr.write(`${handled.message}\n`);
      return handled.exitCode;
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
      let libraryAsset: unknown;
      if (resource === "skill" && !argv.includes("--no-library")) {
        registerGeneratedSkillInLibrary({
          id: created.id,
          title: createTitle(created.id, created.id),
          sourcePath: path.join(projectRoot, created.path),
          flags,
        });
        libraryAsset = { id: created.id, path: path.join(projectRoot, created.path) };
      }
      if (wantsJson) {
        writeJson(context.stdout, {
          ok: true,
          projectRoot,
          resource,
          created,
          ...(libraryAsset ? { libraryAsset } : {}),
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

  if (group === "preview" && command === "share") {
    try {
      const targetUrl = resolvePreviewTargetUrl(flags);
      const mode = parsePreviewShareMode(flags.mode);
      const dryRun = argv.includes("--dry-run");
      if (mode === "lan") {
        return await runLanPreviewShare({ targetUrl, flags, stdout: context.stdout, wantsJson, dryRun });
      }
      if (mode === "tailscale") {
        return runTailscalePreviewShare({ targetUrl, flags, stdout: context.stdout, wantsJson, dryRun });
      }
      if (mode === "cloudflare") {
        return await runCloudflarePreviewShare({ targetUrl, flags, stdout: context.stdout, wantsJson, dryRun });
      }
      context.stderr.write(`Use ${binName} browser share for Relay-backed remote browser sessions.\n`);
      return CLI_EXIT_USAGE;
    } catch (error) {
      const handled = cliErrorFromUnknown(error);
      if (wantsJson) writeCliError(context.stdout, handled);
      else context.stderr.write(`${handled.message}\n`);
      return handled.exitCode;
    }
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
    const workspaceClaw = await createCliWorkspaceClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, context.cwd);
    const inspected = await claw.workspace.inspect();
    const productivity = await workspaceClaw.productivity.inspect();
    const hasLocalProductivityState = fs.existsSync(productivity.dataPath);
    if (wantsJson) {
      writeJson(context.stdout, { ...inspected, productivity });
    } else {
      context.stdout.write(`manifest: ${inspected.manifest ? "present" : "missing"}\n`);
      context.stdout.write(`compatSnapshot: ${inspected.compatSnapshot ? "present" : "missing"}\n`);
      context.stdout.write(`productivityDb: ${productivity.dataPath}\n`);
      context.stdout.write(`productivitySchema: ${productivity.schemaVersion}\n`);
    }
    return inspected.manifest || hasLocalProductivityState ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
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
    const workspaceClaw = await createCliWorkspaceClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, context.cwd);
    const repaired = await claw.workspace.repair();
    const productivity = await workspaceClaw.productivity.repair();
    if (wantsJson) {
      writeJson(context.stdout, { ...repaired, productivity });
    } else {
      context.stdout.write(`createdDirectories=${repaired.createdDirectories.length} createdRuntimeFiles=${repaired.createdRuntimeFiles.length}\n`);
      context.stdout.write(`repairedRecords=${productivity.repairedRecords} reindexed=${productivity.reindexed}\n`);
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
    const riskTier = flags["risk-tier"] || flags.risk;
    if (!riskTier) {
      context.stderr.write("--risk-tier is required\n");
      return CLI_EXIT_USAGE;
    }
    const body = flags.body;
    const declaredFields = inferBrokerDeclaredFields({ url, headers, body });
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const payload = await claw.secrets.brokerHttp({
      method,
      url,
      capability: "broker.http",
      agent: flags.agent || agentId || "claw-cli",
      riskTier: riskTier as "read" | "write" | "destructive" | "cost" | "system",
      declaredFields,
      ...(flags["approval-satisfied"] === "true" ? { approvalSatisfied: true } : {}),
      ...(headers ? { headers } : {}),
      ...(body ? { body } : {}),
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
    const provider = flags.provider || (runtimeAdapterId === "codex" ? "openai-codex" : undefined);
    if (!provider) {
      context.stderr.write("--provider is required\n");
      return CLI_EXIT_USAGE;
    }
    if (runtimeAdapterId === "codex" && readBooleanFlag(argv, flags, "force", false) && !argv.includes("--dry-run")) {
      const logoutCommand = buildCodexCommand(["logout"], {
        homeDir: flags["home-dir"],
        env: process.env,
      });
      const logoutExitCode = await runForegroundProcess(logoutCommand.command, logoutCommand.args, {
        cwd: workspaceRoot,
        env: logoutCommand.env,
        stdout: context.stdout,
        stderr: context.stderr,
      });
      if (logoutExitCode !== CLI_EXIT_OK) return logoutExitCode;
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
    const provider = flags.provider || (runtimeAdapterId === "codex" ? "openai-codex" : undefined);
    if (!provider) {
      context.stderr.write("--provider is required\n");
      return CLI_EXIT_USAGE;
    }
    if (runtimeAdapterId === "codex") {
      const logoutCommand = buildCodexCommand(["logout"], {
        homeDir: flags["home-dir"],
        env: process.env,
      });
      return await runForegroundProcess(logoutCommand.command, logoutCommand.args, {
        cwd: workspaceRoot,
        env: logoutCommand.env,
        stdout: context.stdout,
        stderr: context.stderr,
      });
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

  if (group === "calendar") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    if (command === "list" || !command) {
      const payload = await claw.calendar.list({
        workspaceId: flags["workspace-id"] || workspaceId,
        ...(flags.status ? { status: flags.status as TemporalItem["status"] } : {}),
        ...(flags["project-id"] ? { projectId: flags["project-id"] } : {}),
        ...(flags["agent-id"] ? { agentId: flags["agent-id"] } : {}),
      });
      if (wantsJson) writeJson(context.stdout, payload);
      else writeTemporalItems(context.stdout, payload.items, { empty: "No calendar events" });
      return CLI_EXIT_OK;
    }
    if (command === "at") {
      const expression = subcommand;
      const title = joinedPositionals(positionals, 3) || flags.title;
      if (!expression || !title) {
        context.stderr.write("Usage: claw calendar at <expression> <title>\n");
        return CLI_EXIT_USAGE;
      }
      const payload = await claw.calendar.at({
        title,
        expression,
        description: flags.description,
        location: flags.location,
        timezone: flags.timezone,
        workspaceId,
        ...(flags["project-id"] ? { projectId: flags["project-id"] } : {}),
        ...(flags["agent-id"] ? { agentId: flags["agent-id"] } : {}),
      });
      if (wantsJson) writeJson(context.stdout, payload);
      else writeTemporalItems(context.stdout, [payload.item]);
      return CLI_EXIT_OK;
    }
    if (command === "create") {
      const title = subcommand || flags.title;
      if (!title || !flags["starts-at"]) {
        context.stderr.write("Usage: claw calendar create <title> --starts-at ISO [--ends-at ISO] [--location TEXT]\n");
        return CLI_EXIT_USAGE;
      }
      const payload = await claw.calendar.create({
        title,
        description: flags.description,
        location: flags.location,
        startsAt: flags["starts-at"],
        endsAt: flags["ends-at"],
        timezone: flags.timezone,
        workspaceId,
        ...(flags["project-id"] ? { projectId: flags["project-id"] } : {}),
        ...(flags["agent-id"] ? { agentId: flags["agent-id"] } : {}),
        schedule: { mode: "one_off", timezone: flags.timezone || "UTC", startsAt: flags["starts-at"] },
      });
      if (wantsJson) writeJson(context.stdout, payload);
      else writeTemporalItems(context.stdout, [payload.item]);
      return CLI_EXIT_OK;
    }
    if (command === "get") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw calendar get <id>\n");
        return CLI_EXIT_USAGE;
      }
      const payload = await claw.calendar.get(id);
      if (wantsJson) writeJson(context.stdout, payload);
      else writeTemporalItems(context.stdout, [payload.item]);
      return CLI_EXIT_OK;
    }
    if (command === "update") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw calendar update <id> [--title TEXT] [--starts-at ISO]\n");
        return CLI_EXIT_USAGE;
      }
      const payload = await claw.calendar.update(id, {
        title: flags.title,
        description: flags.description,
        location: flags.location,
        startsAt: flags["starts-at"],
        endsAt: flags["ends-at"],
        ...(flags.timezone ? { timezone: flags.timezone } : {}),
        ...(flags["starts-at"] ? { schedule: { mode: "one_off", timezone: flags.timezone || "UTC", startsAt: flags["starts-at"] } } : {}),
      });
      if (wantsJson) writeJson(context.stdout, payload);
      else writeTemporalItems(context.stdout, [payload.item]);
      return CLI_EXIT_OK;
    }
    if (command === "delete") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw calendar delete <id>\n");
        return CLI_EXIT_USAGE;
      }
      const payload = await claw.calendar.delete(id);
      if (wantsJson) writeJson(context.stdout, payload);
      else context.stdout.write("ok\n");
      return CLI_EXIT_OK;
    }
  }

  if (group === "routines") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    if (command === "list" || !command) {
      const payload = await claw.routines.list({
        workspaceId: flags["workspace-id"] || workspaceId,
        ...(flags.status ? { status: flags.status as TemporalItem["status"] } : {}),
        ...(flags["project-id"] ? { projectId: flags["project-id"] } : {}),
        ...(flags["agent-id"] ? { agentId: flags["agent-id"] } : {}),
      });
      if (wantsJson) writeJson(context.stdout, payload);
      else writeTemporalItems(context.stdout, payload.items, { empty: "No routines" });
      return CLI_EXIT_OK;
    }
    if (command === "every") {
      const expression = subcommand;
      const title = joinedPositionals(positionals, 3) || flags.title;
      if (!expression || !title) {
        context.stderr.write("Usage: claw routines every <duration> <title>\n");
        return CLI_EXIT_USAGE;
      }
      if (parseSimpleDurationMs(expression) === null) {
        throw new CliHandledError("invalid_duration", `Unsupported duration "${expression}". Use simple durations like 30s, 30m, 24h, or 2d.`, CLI_EXIT_USAGE);
      }
      const staggerMs = parseRoutineStaggerMs(flags, argv);
      const heartbeat = buildRoutineHeartbeat(argv, flags);
      const payload = await claw.routines.every({
        title,
        expression,
        description: flags.description,
        timezone: flags.timezone,
        ...(staggerMs !== undefined ? { schedule: { staggerMs } } : {}),
        ...(heartbeat ? { heartbeat: { ...heartbeat, ...(staggerMs !== undefined ? { staggerMs } : {}) } } : {}),
        workspaceId,
        ...(flags["project-id"] ? { projectId: flags["project-id"] } : {}),
        ...(flags["agent-id"] ? { agentId: flags["agent-id"] } : {}),
      });
      if (wantsJson) writeJson(context.stdout, payload);
      else writeTemporalItems(context.stdout, [payload.item]);
      return CLI_EXIT_OK;
    }
    if (command === "create") {
      const title = subcommand || flags.title;
      if (!title || (!flags.cron && !flags.rrule)) {
        context.stderr.write("Usage: claw routines create <title> --cron EXPR|--rrule RRULE\n");
        return CLI_EXIT_USAGE;
      }
      const staggerMs = parseRoutineStaggerMs(flags, argv);
      const payload = await claw.routines.create({
        title,
        description: flags.description,
        timezone: flags.timezone,
        workspaceId,
        ...(flags["project-id"] ? { projectId: flags["project-id"] } : {}),
        ...(flags["agent-id"] ? { agentId: flags["agent-id"] } : {}),
        schedule: {
          mode: flags.rrule ? "rrule" : "cron",
          timezone: flags.timezone || "UTC",
          ...(flags.cron ? { cron: flags.cron } : {}),
          ...(flags.rrule ? { rrule: flags.rrule } : {}),
          ...(staggerMs !== undefined ? { staggerMs } : {}),
        },
      });
      if (wantsJson) writeJson(context.stdout, payload);
      else writeTemporalItems(context.stdout, [payload.item]);
      return CLI_EXIT_OK;
    }
    if (command === "get") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw routines get <id>\n");
        return CLI_EXIT_USAGE;
      }
      const payload = await claw.routines.get(id);
      if (wantsJson) writeJson(context.stdout, payload);
      else writeTemporalItems(context.stdout, [payload.item]);
      return CLI_EXIT_OK;
    }
    if (command === "update") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw routines update <id> [--title TEXT] [--cron EXPR|--rrule RRULE]\n");
        return CLI_EXIT_USAGE;
      }
      const payload = await claw.routines.update(id, {
        title: flags.title,
        description: flags.description,
        status: flags.status as TemporalItem["status"] | undefined,
        ...(flags.timezone ? { timezone: flags.timezone } : {}),
        ...(flags.cron || flags.rrule
          ? {
              schedule: {
                mode: flags.rrule ? "rrule" : "cron",
                timezone: flags.timezone || "UTC",
                ...(flags.cron ? { cron: flags.cron } : {}),
                ...(flags.rrule ? { rrule: flags.rrule } : {}),
              },
            }
          : {}),
      });
      if (wantsJson) writeJson(context.stdout, payload);
      else writeTemporalItems(context.stdout, [payload.item]);
      return CLI_EXIT_OK;
    }
    if (command === "delete") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw routines delete <id>\n");
        return CLI_EXIT_USAGE;
      }
      const payload = await claw.routines.delete(id);
      if (wantsJson) writeJson(context.stdout, payload);
      else context.stdout.write("ok\n");
      return CLI_EXIT_OK;
    }
    if (command === "enable" || command === "disable" || command === "run") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write(`Usage: claw routines ${command} <id>\n`);
        return CLI_EXIT_USAGE;
      }
      const payload = command === "enable"
        ? await claw.routines.enable(id)
        : command === "disable"
          ? await claw.routines.disable(id)
          : await claw.routines.run(id);
      if (wantsJson) writeJson(context.stdout, payload);
      else writeTemporalItems(context.stdout, [payload.item]);
      return CLI_EXIT_OK;
    }
    if (command === "history") {
      const payload = await claw.routines.history(subcommand || flags.id || flags["item-id"]);
      if (wantsJson) writeJson(context.stdout, payload);
      else writeTemporalExecutions(context.stdout, payload.executions);
      return CLI_EXIT_OK;
    }
  }

  if (group === "watch") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    if (command === "list" || !command) {
      const payload = await claw.watch.list({
        workspaceId: flags["workspace-id"] || workspaceId,
        ...(flags.status ? { status: flags.status as TemporalItem["status"] } : {}),
        ...(flags["project-id"] ? { projectId: flags["project-id"] } : {}),
        ...(flags["agent-id"] ? { agentId: flags["agent-id"] } : {}),
      });
      if (wantsJson) writeJson(context.stdout, payload);
      else writeTemporalItems(context.stdout, payload.items, { empty: "No watches" });
      return CLI_EXIT_OK;
    }
    if (command === "get") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw watch get <id>\n");
        return CLI_EXIT_USAGE;
      }
      const payload = await claw.watch.get(id);
      if (wantsJson) writeJson(context.stdout, payload);
      else writeTemporalItems(context.stdout, [payload.item]);
      return CLI_EXIT_OK;
    }
    if (command === "enable" || command === "disable") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write(`Usage: claw watch ${command} <id>\n`);
        return CLI_EXIT_USAGE;
      }
      const payload = command === "enable" ? await claw.watch.enable(id) : await claw.watch.disable(id);
      if (wantsJson) writeJson(context.stdout, payload);
      else writeTemporalItems(context.stdout, [payload.item]);
      return CLI_EXIT_OK;
    }
    if (command === "delete") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw watch delete <id>\n");
        return CLI_EXIT_USAGE;
      }
      const payload = await claw.watch.delete(id);
      if (wantsJson) writeJson(context.stdout, payload);
      else context.stdout.write("ok\n");
      return CLI_EXIT_OK;
    }
    const targetValue = command;
    const after = flags.after;
    const ifNo = flags["if-no"];
    const thenKind = flags.then;
    const title = joinedPositionals(positionals, 2) || flags.title;
    if (!targetValue || !after || thenKind !== "remind" || !title) {
      context.stderr.write('Usage: claw watch <target> --if-no reply --after 24h --then remind "message"\n');
      return CLI_EXIT_USAGE;
    }
    if (ifNo !== "reply") {
      throw new CliHandledError("usage_error", 'Only "--if-no reply" is supported today.', CLI_EXIT_USAGE);
    }
    const target = parseWatchTarget(targetValue);
    const payload = await claw.watch.create({
      target: targetValue,
      after,
      ifNo,
      then: { kind: "remind", title },
      title,
      timezone: flags.timezone,
      description: flags.description,
      workspaceId,
      ...(flags["project-id"] ? { projectId: flags["project-id"] } : {}),
      ...(flags["agent-id"] ? { agentId: flags["agent-id"] } : {}),
      anchorType: target.anchorType,
      anchorId: target.anchorId,
      anchorAt: flags["anchor-at"],
    });
    if (wantsJson) writeJson(context.stdout, payload);
    else writeTemporalItems(context.stdout, [payload.item]);
    return CLI_EXIT_OK;
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
    const title = joinedPositionals(positionals, 3) || flags.title;
    if (!expression || !title) {
      context.stderr.write("Usage: claw schedule at|every|after <expression> <title> [--anchor-type TYPE --anchor-id ID --anchor-at ISO]\n");
      return CLI_EXIT_USAGE;
    }
    const durationMs = parseSimpleDurationMs(expression);
    if ((command === "after" || command === "every") && durationMs === null) {
      throw new CliHandledError("invalid_duration", `Unsupported duration "${expression}". Use simple durations like 30m, 24h, or 2d.`, CLI_EXIT_USAGE);
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
        anchorAt: flags["anchor-at"] ?? (command === "after" && durationMs !== null ? new Date(Date.now() + durationMs).toISOString() : undefined),
      },
    });
    if (wantsJson) writeJson(context.stdout, payload);
    else context.stdout.write(`${payload.item.id}\n`);
    return CLI_EXIT_OK;
  }

  const workCommand = group === "work" ? command : group;
  const workSubcommand = group === "work" ? subcommand : command;
  if (workCommand === "export" || workCommand === "import" || workCommand === "backup" || workCommand === "agenda" || workCommand === "review" || workCommand === "my-work" || workCommand === "team-work" || workCommand === "timeline") {
    const claw = await createCliWorkspaceClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, context.cwd);
    if (workCommand === "export") {
      const targetPath = workSubcommand || flags.path;
      if (!targetPath) {
        context.stderr.write(`Usage: ${binName} work export <file>\n`);
        return CLI_EXIT_USAGE;
      }
      const snapshot = await claw.productivity.exportSnapshot();
      const absolutePath = path.resolve(context.cwd, targetPath);
      fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
      fs.writeFileSync(absolutePath, JSON.stringify(snapshot, null, 2));
      if (wantsJson) writeJson(context.stdout, { path: absolutePath });
      else context.stdout.write(`${absolutePath}\n`);
      return CLI_EXIT_OK;
    }
    if (workCommand === "import") {
      const sourcePath = workSubcommand || flags.path;
      if (!sourcePath) {
        context.stderr.write(`Usage: ${binName} work import <file> [--replace]\n`);
        return CLI_EXIT_USAGE;
      }
      const absolutePath = path.resolve(context.cwd, sourcePath);
      const payload = JSON.parse(fs.readFileSync(absolutePath, "utf8")) as Record<string, unknown>;
      const imported = await claw.productivity.importSnapshot(payload, {
        replace: readBooleanFlag(argv, flags, "replace", false),
      });
      if (wantsJson) writeJson(context.stdout, imported);
      else context.stdout.write(`${Object.values(imported.importedCollections).reduce((sum, value) => sum + value, 0)}\n`);
      return CLI_EXIT_OK;
    }
    if (workCommand === "backup") {
      const targetDir = workSubcommand || flags.path;
      if (!targetDir) {
        context.stderr.write(`Usage: ${binName} work backup <directory>\n`);
        return CLI_EXIT_USAGE;
      }
      const backup = await claw.productivity.backup(targetDir);
      if (wantsJson) writeJson(context.stdout, backup);
      else context.stdout.write(`${backup.files.join("\n")}\n`);
      return backup.files.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
    if (workCommand === "agenda") {
      const agenda = await claw.agenda.list({
        start: flags.start,
        end: flags.end,
        includeCompleted: readBooleanFlag(argv, flags, "include-completed", false),
      });
      if (wantsJson) writeJson(context.stdout, agenda);
      else context.stdout.write(`${agenda.items.map((item) => `${item.when} ${item.domain} ${item.status} ${item.title}`).join("\n")}\n`);
      return CLI_EXIT_OK;
    }
    if (workCommand === "timeline") {
      const mode = (workSubcommand || "week") as "day" | "week";
      if (mode !== "day" && mode !== "week") {
        context.stderr.write(`Usage: ${binName} work timeline day|week [--start ISO] [--project-id ID]\n`);
        return CLI_EXIT_USAGE;
      }
      const range = timelineRange(mode, flags.start);
      const timeline = await claw.productivity.timeline({
        ...range,
        ...(flags["project-id"] ? { projectId: flags["project-id"] } : {}),
        includeDone: readBooleanFlag(argv, flags, "include-done", readBooleanFlag(argv, flags, "include-completed", false)),
      });
      if (wantsJson) writeJson(context.stdout, timeline);
      else {
        const lines = [
          `now=${timeline.now.primary?.title ?? "none"}`,
          ...timeline.projects.map((project) => `${project.title}: tasks=${project.tasks.length} milestones=${project.milestones.length} deadlines=${project.deadlines.length} cycles=${project.cycles.length}`),
        ];
        context.stdout.write(`${lines.join("\n")}\n`);
      }
      return CLI_EXIT_OK;
    }
    if (workCommand === "review") {
      const cadence = (workSubcommand || "daily") as "daily" | "weekly";
      if (cadence !== "daily" && cadence !== "weekly") {
        context.stderr.write(`Usage: ${binName} work review daily|weekly\n`);
        return CLI_EXIT_USAGE;
      }
      const review = cadence === "weekly" ? await claw.review.weekly() : await claw.review.daily();
      if (wantsJson) writeJson(context.stdout, review);
      else context.stdout.write(`blocked=${review.summary.blockedTasks} overdue=${review.summary.overdueTasks} goals=${review.summary.activeGoals} projects=${review.summary.activeProjects}\n`);
      return CLI_EXIT_OK;
    }
    if (workCommand === "my-work") {
      const myWork = await claw.productivity.myWork({
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, myWork);
      else context.stdout.write(`triage=${myWork.summary.triageThreads} ready=${myWork.summary.readyTasks} blocked=${myWork.summary.blockedTasks} blockers=${myWork.summary.activeBlockers} decisions=${myWork.summary.pendingDecisions}\n`);
      return CLI_EXIT_OK;
    }
    if (workCommand === "team-work") {
      const teamWork = await claw.productivity.teamWork({
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, teamWork);
      else context.stdout.write(`assignments=${teamWork.summary.activeAssignments} handoffs=${teamWork.summary.pendingHandoffs} approvals=${teamWork.summary.pendingApprovals} overloaded=${teamWork.summary.overloadedAgents}\n`);
      return CLI_EXIT_OK;
    }
  }

  const genericProductivityGroupMap: Record<string, string> = {
    lists: "lists",
    sections: "sections",
    comments: "comments",
    attachments: "attachments",
    "saved-views": "saved_views",
    recurrences: "recurrences",
    cycles: "cycles",
    sprints: "cycles",
    epics: "epics",
    initiatives: "epics",
    "custom-fields": "custom_fields",
    "field-values": "field_values",
    templates: "templates",
  };
  if (group && genericProductivityGroupMap[group]) {
    return await runCoreProductivityDbCli({
      argv,
      positionals: ["db", genericProductivityGroupMap[group], ...positionals.slice(1)],
      flags,
      workspaceRoot,
      stdout: context.stdout,
      stderr: context.stderr,
      wantsJson,
      appId,
      workspaceId,
      agentId,
      contextCwd: context.cwd,
    });
  }

  if (group === "areas") {
    const claw = await createCliWorkspaceClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, context.cwd);
    if (command === "list") {
      const areas = await claw.areas.list({
        ...(flags.status ? { status: parseCsvFlag(flags.status) as Array<"active" | "paused" | "archived"> } : {}),
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
        includeArchived: readBooleanFlag(argv, flags, "include-archived", false),
      });
      if (wantsJson) writeJson(context.stdout, areas);
      else context.stdout.write(`${areas.map((area) => `${area.status} ${area.id} ${area.name}`).join("\n")}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "get") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw areas get <id> [--json]\n");
        return CLI_EXIT_USAGE;
      }
      const area = await claw.areas.get(id);
      if (!area) return CLI_EXIT_FAILURE;
      if (wantsJson) writeJson(context.stdout, area);
      else context.stdout.write(`${area.status} ${area.id} ${area.name}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "create") {
      const name = joinedPositionals(positionals, 2) || flags.name || flags.title;
      if (!name) {
        context.stderr.write("Usage: claw areas create <name> [--status STATUS]\n");
        return CLI_EXIT_USAGE;
      }
      const area = await claw.areas.create({
        name,
        description: flags.description,
        status: flags.status as "active" | "paused" | "archived" | undefined,
        color: flags.color,
        ownerPersonId: flags["owner-person-id"],
      });
      if (wantsJson) writeJson(context.stdout, area);
      else context.stdout.write(`${area.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "update") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw areas update <id> [--name TEXT] [--status STATUS]\n");
        return CLI_EXIT_USAGE;
      }
      const area = await claw.areas.update(id, {
        name: flags.name || flags.title,
        description: flags.description,
        status: flags.status as "active" | "paused" | "archived" | undefined,
        color: flags.color,
        ownerPersonId: flags["owner-person-id"],
      });
      if (wantsJson) writeJson(context.stdout, area);
      else context.stdout.write(`${area.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "delete") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw areas delete <id>\n");
        return CLI_EXIT_USAGE;
      }
      const result = await archiveOrRemoveProductivityRecord(claw.areas, id, argv, flags, "areas");
      if (wantsJson) writeJson(context.stdout, result);
      else context.stdout.write("ok\n");
      return CLI_EXIT_OK;
    }
    if (command === "search") {
      const query = subcommand || flags.query;
      if (!query) {
        context.stderr.write("Usage: claw areas search <query>\n");
        return CLI_EXIT_USAGE;
      }
      const results = await claw.areas.search(query, {
        strategy: flags.strategy as "auto" | "keyword" | "semantic" | "hybrid" | undefined,
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, results);
      else context.stdout.write(`${results.map((result) => `${result.score.toFixed(1)} ${result.id} ${result.title}`).join("\n")}\n`);
      return results.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
  }

  if (group === "tasks") {
    const claw = await createCliWorkspaceClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, context.cwd);
    if (command === "list") {
      const tasks = await claw.tasks.list({
        ...(flags.status ? { status: parseCsvFlag(flags.status) as Array<"todo" | "in_progress" | "blocked" | "done" | "cancelled"> } : {}),
        ...(flags.assignee ? { assigneePersonId: flags.assignee } : {}),
        ...(flags["project-id"] ? { projectId: flags["project-id"] } : {}),
        ...(flags["goal-id"] ? { goalId: flags["goal-id"] } : {}),
        ...(flags["area-id"] ? { areaId: flags["area-id"] } : {}),
        ...(flags["list-id"] ? { listId: flags["list-id"] } : {}),
        ...(flags["section-id"] ? { sectionId: flags["section-id"] } : {}),
        ...(flags["cycle-id"] ? { cycleId: flags["cycle-id"] } : {}),
        ...(flags["epic-id"] ? { epicId: flags["epic-id"] } : {}),
        ...(argv.includes("--blocked") ? { blocked: readBooleanFlag(argv, flags, "blocked", true) } : {}),
        ...(argv.includes("--overdue") ? { overdue: readBooleanFlag(argv, flags, "overdue", true) } : {}),
        ...(argv.includes("--has-reminder") ? { hasReminder: readBooleanFlag(argv, flags, "has-reminder", true) } : {}),
        ...(flags.ids ? { ids: parseCsvFlag(flags.ids) } : {}),
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
        includeArchived: readBooleanFlag(argv, flags, "include-archived", false),
      });
      if (wantsJson) writeJson(context.stdout, tasks);
      else context.stdout.write(`${tasks.map((task) => `${task.status} ${task.id} ${task.title}`).join("\n")}\n`);
      return CLI_EXIT_OK;
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
      const title = joinedPositionals(positionals, 2) || flags.title;
      if (!title) {
        context.stderr.write("Usage: claw tasks create <title> [--description TEXT] [--status STATUS] [--priority PRIORITY] [--labels a,b]\n");
        return CLI_EXIT_USAGE;
      }
      const task = await claw.tasks.create({
        title,
        description: flags.description,
        status: flags.status as "todo" | "in_progress" | "blocked" | "done" | "cancelled" | undefined,
        type: flags.type as "todo" | "task" | "bug" | "story" | "feature" | "chore" | undefined,
        priority: flags.priority as "low" | "medium" | "high" | "urgent" | undefined,
        ...(flags.rank ? { rank: Number(flags.rank) } : {}),
        labels: parseCsvFlag(flags.labels),
        areaId: flags["area-id"],
        listId: flags["list-id"],
        sectionId: flags["section-id"],
        assigneePersonId: flags.assignee,
        reporterPersonId: flags["reporter-person-id"],
        watcherPersonIds: parseCsvFlag(flags.watchers),
        startAt: flags["start-at"],
        deferUntil: flags["defer-until"],
        dueAt: flags["due-at"],
        deadlineAt: flags["deadline-at"],
        snoozedUntil: flags["snoozed-until"],
        recurrenceRule: flags["recurrence-rule"],
        ...(flags["estimate-minutes"] ? { estimateMinutes: Number(flags["estimate-minutes"]) } : {}),
        ...(flags["actual-minutes"] ? { actualMinutes: Number(flags["actual-minutes"]) } : {}),
        ...(flags["story-points"] ? { storyPoints: Number(flags["story-points"]) } : {}),
        blockedReason: flags["blocked-reason"],
        waitingOn: flags["waiting-on"],
        startedAt: flags["started-at"],
        completedAt: flags["completed-at"],
        cancelledAt: flags["cancelled-at"],
        eventId: flags["event-id"],
        projectId: flags["project-id"],
        goalId: flags["goal-id"],
        cycleId: flags["cycle-id"],
        epicId: flags["epic-id"],
        parentTaskId: flags["parent-task-id"],
        childTaskIds: parseCsvFlag(flags["child-task-ids"]),
        dependsOnTaskIds: parseCsvFlag(flags["depends-on"]),
        commentIds: parseCsvFlag(flags["comment-ids"]),
        attachmentIds: parseCsvFlag(flags["attachment-ids"]),
        checklist: parseJsonFlag<Array<{ id?: string; text: string; completed?: boolean }>>(flags["checklist-json"], "--checklist-json"),
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
        type: flags.type as "todo" | "task" | "bug" | "story" | "feature" | "chore" | undefined,
        priority: flags.priority as "low" | "medium" | "high" | "urgent" | undefined,
        ...(flags.rank ? { rank: Number(flags.rank) } : {}),
        ...(flags.labels ? { labels: parseCsvFlag(flags.labels) } : {}),
        areaId: flags["area-id"],
        listId: flags["list-id"],
        sectionId: flags["section-id"],
        assigneePersonId: flags.assignee,
        reporterPersonId: flags["reporter-person-id"],
        ...(flags.watchers ? { watcherPersonIds: parseCsvFlag(flags.watchers) } : {}),
        startAt: flags["start-at"],
        deferUntil: flags["defer-until"],
        dueAt: flags["due-at"],
        deadlineAt: flags["deadline-at"],
        snoozedUntil: flags["snoozed-until"],
        recurrenceRule: flags["recurrence-rule"],
        ...(flags["estimate-minutes"] ? { estimateMinutes: Number(flags["estimate-minutes"]) } : {}),
        ...(flags["actual-minutes"] ? { actualMinutes: Number(flags["actual-minutes"]) } : {}),
        ...(flags["story-points"] ? { storyPoints: Number(flags["story-points"]) } : {}),
        blockedReason: flags["blocked-reason"],
        waitingOn: flags["waiting-on"],
        startedAt: flags["started-at"],
        completedAt: flags["completed-at"],
        cancelledAt: flags["cancelled-at"],
        eventId: flags["event-id"],
        projectId: flags["project-id"],
        goalId: flags["goal-id"],
        cycleId: flags["cycle-id"],
        epicId: flags["epic-id"],
        parentTaskId: flags["parent-task-id"],
        ...(flags["child-task-ids"] ? { childTaskIds: parseCsvFlag(flags["child-task-ids"]) } : {}),
        ...(flags["depends-on"] ? { dependsOnTaskIds: parseCsvFlag(flags["depends-on"]) } : {}),
        ...(flags["comment-ids"] ? { commentIds: parseCsvFlag(flags["comment-ids"]) } : {}),
        ...(flags["attachment-ids"] ? { attachmentIds: parseCsvFlag(flags["attachment-ids"]) } : {}),
        ...(flags["checklist-json"] ? { checklist: parseJsonFlag<Array<{ id?: string; text: string; completed?: boolean }>>(flags["checklist-json"], "--checklist-json") } : {}),
        companyId: flags["company-id"],
        portfolioId: flags["portfolio-id"],
        portfolioItemId: flags["portfolio-item-id"],
      });
      if (wantsJson) writeJson(context.stdout, task);
      else context.stdout.write(`${task.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "complete") {
      const ids = parseCsvFlag(flags.ids);
      const allIds = ids.length > 0 ? ids : [subcommand || flags.id].filter(Boolean) as string[];
      if (allIds.length === 0) {
        context.stderr.write("Usage: claw tasks complete <id> | --ids a,b\n");
        return CLI_EXIT_USAGE;
      }
      const tasks = await Promise.all(allIds.map((id) => claw.tasks.complete(id)));
      if (wantsJson) writeJson(context.stdout, tasks.length === 1 ? tasks[0] : tasks);
      else context.stdout.write(`${tasks.map((task) => task.id).join("\n")}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "move") {
      const ids = parseCsvFlag(flags.ids);
      if (ids.length === 0) {
        context.stderr.write("Usage: claw tasks move --ids a,b [--project-id ID] [--goal-id ID] [--area-id ID]\n");
        return CLI_EXIT_USAGE;
      }
      const tasks = await Promise.all(ids.map((id) => claw.tasks.update(id, {
        projectId: flags["project-id"],
        goalId: flags["goal-id"],
        areaId: flags["area-id"],
      })));
      if (wantsJson) writeJson(context.stdout, tasks);
      else context.stdout.write(`${tasks.map((task) => task.id).join("\n")}\n`);
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
        ...(flags["area-id"] ? { areaId: flags["area-id"] } : {}),
        ...(flags["project-id"] ? { projectId: flags["project-id"] } : {}),
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
        includeArchived: readBooleanFlag(argv, flags, "include-archived", false),
      });
      if (wantsJson) writeJson(context.stdout, goals);
      else context.stdout.write(`${goals.map((goal) => `${goal.status} ${goal.id} ${goal.title}`).join("\n")}\n`);
      return CLI_EXIT_OK;
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
      const title = joinedPositionals(positionals, 2) || flags.title;
      if (!title) {
        context.stderr.write("Usage: claw goals create <title> [--status STATUS] [--project-id ID]\n");
        return CLI_EXIT_USAGE;
      }
      const goal = await claw.goals.create({
        title,
        description: flags.description,
        status: flags.status as "active" | "paused" | "done" | undefined,
        level: flags.level as "company" | "team" | "personal" | undefined,
        areaId: flags["area-id"],
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
        timeframeStart: flags["timeframe-start"],
        timeframeEnd: flags["timeframe-end"],
        reviewCadence: flags["review-cadence"] as "daily" | "weekly" | "monthly" | "quarterly" | undefined,
        metricDirection: flags["metric-direction"] as "increase" | "decrease" | "maintain" | undefined,
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
        areaId: flags["area-id"],
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
        timeframeStart: flags["timeframe-start"],
        timeframeEnd: flags["timeframe-end"],
        reviewCadence: flags["review-cadence"] as "daily" | "weekly" | "monthly" | "quarterly" | undefined,
        metricDirection: flags["metric-direction"] as "increase" | "decrease" | "maintain" | undefined,
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
      const result = await archiveOrRemoveProductivityRecord(claw.goals, id, argv, flags, "goals");
      if (wantsJson) writeJson(context.stdout, result);
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
        ...(flags["area-id"] ? { areaId: flags["area-id"] } : {}),
        ...(flags["goal-id"] ? { goalId: flags["goal-id"] } : {}),
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
        includeArchived: readBooleanFlag(argv, flags, "include-archived", false),
      });
      if (wantsJson) writeJson(context.stdout, projects);
      else context.stdout.write(`${projects.map((project) => `${project.status} ${project.id} ${project.name}`).join("\n")}\n`);
      return CLI_EXIT_OK;
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
      const name = joinedPositionals(positionals, 2) || flags.name || flags.title;
      if (!name) {
        context.stderr.write("Usage: claw projects create <name> [--status STATUS] [--goal-id ID]\n");
        return CLI_EXIT_USAGE;
      }
      const project = await claw.projects.create({
        name,
        description: flags.description,
        status: flags.status as "draft" | "in_progress" | "paused" | "done" | "archived" | undefined,
        areaId: flags["area-id"],
        goalId: flags["goal-id"],
        ownerPersonId: flags["owner-person-id"],
        leadAgentId: flags["lead-agent-id"],
        companyId: flags["company-id"],
        portfolioId: flags["portfolio-id"],
        portfolioItemId: flags["portfolio-item-id"],
        color: flags.color,
        kind: flags.kind as "delivery" | "growth" | "ops" | "research" | "migration" | "other" | undefined,
        ...(flags.rank ? { rank: Number(flags.rank) } : {}),
        statusCategory: flags["status-category"] as "active" | "someday" | "planned" | "done" | "archived" | undefined,
        healthStatus: flags["health-status"] as "green" | "yellow" | "red" | "unknown" | undefined,
        startAt: flags["start-at"],
        startDate: flags["start-date"],
        targetDate: flags["target-date"],
        deadlineAt: flags["deadline-at"],
        milestoneIds: parseCsvFlag(flags["milestone-ids"]),
        defaultSectionIds: parseCsvFlag(flags["default-section-ids"]),
        templateId: flags["template-id"],
        reviewAt: flags["review-at"],
        reviewCadence: flags["review-cadence"] as "daily" | "weekly" | "monthly" | "quarterly" | undefined,
        archiveReason: flags["archive-reason"],
        completedAt: flags["completed-at"],
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
        areaId: flags["area-id"],
        goalId: flags["goal-id"],
        ownerPersonId: flags["owner-person-id"],
        leadAgentId: flags["lead-agent-id"],
        companyId: flags["company-id"],
        portfolioId: flags["portfolio-id"],
        portfolioItemId: flags["portfolio-item-id"],
        color: flags.color,
        kind: flags.kind as "delivery" | "growth" | "ops" | "research" | "migration" | "other" | undefined,
        ...(flags.rank ? { rank: Number(flags.rank) } : {}),
        statusCategory: flags["status-category"] as "active" | "someday" | "planned" | "done" | "archived" | undefined,
        healthStatus: flags["health-status"] as "green" | "yellow" | "red" | "unknown" | undefined,
        startAt: flags["start-at"],
        startDate: flags["start-date"],
        targetDate: flags["target-date"],
        deadlineAt: flags["deadline-at"],
        ...(flags["milestone-ids"] ? { milestoneIds: parseCsvFlag(flags["milestone-ids"]) } : {}),
        ...(flags["default-section-ids"] ? { defaultSectionIds: parseCsvFlag(flags["default-section-ids"]) } : {}),
        templateId: flags["template-id"],
        reviewAt: flags["review-at"],
        reviewCadence: flags["review-cadence"] as "daily" | "weekly" | "monthly" | "quarterly" | undefined,
        archiveReason: flags["archive-reason"],
        completedAt: flags["completed-at"],
      });
      if (wantsJson) writeJson(context.stdout, project);
      else context.stdout.write(`${project.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "archive") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw projects archive <id> [--cascade]\n");
        return CLI_EXIT_USAGE;
      }
      const project = await claw.projects.archive(id);
      if (readBooleanFlag(argv, flags, "cascade", false)) {
        const anchoredReminders = await claw.reminders.list({ anchorId: id, includeArchived: true, limit: Number.MAX_SAFE_INTEGER });
        const anchoredDeadlines = await claw.deadlines.list({ anchorId: id, includeArchived: true, limit: Number.MAX_SAFE_INTEGER });
        await Promise.all(anchoredReminders.filter((item) => item.status === "active").map((item) => claw.reminders.pause(item.id)));
        await Promise.all(anchoredDeadlines.filter((item) => item.status === "active").map((item) => claw.deadlines.pause(item.id)));
      }
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
      const result = await archiveOrRemoveProductivityRecord(claw.projects, id, argv, flags, "projects");
      if (wantsJson) writeJson(context.stdout, result);
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

  if (group === "milestones") {
    const claw = await createCliWorkspaceClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, context.cwd);
    if (command === "list") {
      const milestones = await claw.milestones.list({
        ...(flags.status ? { status: parseCsvFlag(flags.status) as Array<"planned" | "active" | "done" | "archived"> } : {}),
        ...(flags["area-id"] ? { areaId: flags["area-id"] } : {}),
        ...(flags["project-id"] ? { projectId: flags["project-id"] } : {}),
        ...(flags["goal-id"] ? { goalId: flags["goal-id"] } : {}),
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
        includeArchived: readBooleanFlag(argv, flags, "include-archived", false),
      });
      if (wantsJson) writeJson(context.stdout, milestones);
      else context.stdout.write(`${milestones.map((milestone) => `${milestone.status} ${milestone.id} ${milestone.title}`).join("\n")}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "get") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw milestones get <id> [--json]\n");
        return CLI_EXIT_USAGE;
      }
      const milestone = await claw.milestones.get(id);
      if (!milestone) return CLI_EXIT_FAILURE;
      if (wantsJson) writeJson(context.stdout, milestone);
      else context.stdout.write(`${milestone.status} ${milestone.id} ${milestone.title}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "create") {
      const title = joinedPositionals(positionals, 2) || flags.title;
      if (!title) {
        context.stderr.write("Usage: claw milestones create <title> [--project-id ID] [--area-id ID]\n");
        return CLI_EXIT_USAGE;
      }
      const milestone = await claw.milestones.create({
        title,
        description: flags.description,
        status: flags.status as "planned" | "active" | "done" | "archived" | undefined,
        areaId: flags["area-id"],
        projectId: flags["project-id"],
        goalId: flags["goal-id"],
        targetDate: flags["target-date"],
        completedAt: flags["completed-at"],
      });
      if (wantsJson) writeJson(context.stdout, milestone);
      else context.stdout.write(`${milestone.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "update") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw milestones update <id> [--title TEXT] [--status STATUS]\n");
        return CLI_EXIT_USAGE;
      }
      const milestone = await claw.milestones.update(id, {
        title: flags.title,
        description: flags.description,
        status: flags.status as "planned" | "active" | "done" | "archived" | undefined,
        areaId: flags["area-id"],
        projectId: flags["project-id"],
        goalId: flags["goal-id"],
        targetDate: flags["target-date"],
        completedAt: flags["completed-at"],
      });
      if (wantsJson) writeJson(context.stdout, milestone);
      else context.stdout.write(`${milestone.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "delete") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw milestones delete <id>\n");
        return CLI_EXIT_USAGE;
      }
      const result = await archiveOrRemoveProductivityRecord(claw.milestones, id, argv, flags, "milestones");
      if (wantsJson) writeJson(context.stdout, result);
      else context.stdout.write("ok\n");
      return CLI_EXIT_OK;
    }
    if (command === "search") {
      const query = subcommand || flags.query;
      if (!query) {
        context.stderr.write("Usage: claw milestones search <query>\n");
        return CLI_EXIT_USAGE;
      }
      const results = await claw.milestones.search(query, {
        strategy: flags.strategy as "auto" | "keyword" | "semantic" | "hybrid" | undefined,
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, results);
      else context.stdout.write(`${results.map((result) => `${result.score.toFixed(1)} ${result.id} ${result.title}`).join("\n")}\n`);
      return results.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
  }

  if (group === "activity") {
    const claw = await createCliWorkspaceClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, context.cwd);
    if (command === "list") {
      const activity = await claw.activity.list({
        entityType: flags["entity-type"] as any,
        entityId: flags["entity-id"],
        projectId: flags["project-id"],
        taskId: flags["task-id"],
        threadId: flags["thread-id"],
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, activity);
      else context.stdout.write(`${activity.map((entry) => `${entry.kind} ${entry.id} ${entry.title}`).join("\n")}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "get") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw activity get <id> [--json]\n");
        return CLI_EXIT_USAGE;
      }
      const entry = await claw.activity.get(id);
      if (!entry) return CLI_EXIT_FAILURE;
      if (wantsJson) writeJson(context.stdout, entry);
      else context.stdout.write(`${entry.kind} ${entry.id} ${entry.title}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "search") {
      const query = subcommand || flags.query;
      if (!query) {
        context.stderr.write("Usage: claw activity search <query>\n");
        return CLI_EXIT_USAGE;
      }
      const results = await claw.activity.search(query, {
        strategy: flags.strategy as "auto" | "keyword" | "semantic" | "hybrid" | undefined,
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, results);
      else context.stdout.write(`${results.map((result) => `${result.score.toFixed(1)} ${result.id} ${result.title}`).join("\n")}\n`);
      return results.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
  }

  if (group === "blockers") {
    const claw = await createCliWorkspaceClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, context.cwd);
    if (command === "list") {
      const blockers = await claw.blockers.list({
        ...(flags.status ? { status: parseCsvFlag(flags.status) as Array<"active" | "resolved" | "cancelled"> } : {}),
        ...(flags.kind ? { kind: parseCsvFlag(flags.kind) as Array<"waiting_human" | "waiting_agent" | "waiting_system" | "missing_context" | "policy_block"> } : {}),
        ...(flags["task-id"] ? { taskId: flags["task-id"] } : {}),
        ...(flags["project-id"] ? { projectId: flags["project-id"] } : {}),
        ...(flags["goal-id"] ? { goalId: flags["goal-id"] } : {}),
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
        includeArchived: readBooleanFlag(argv, flags, "include-archived", false),
      });
      if (wantsJson) writeJson(context.stdout, blockers);
      else context.stdout.write(`${blockers.map((blocker) => `${blocker.status} ${blocker.id} ${blocker.title}`).join("\n")}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "get") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw blockers get <id>\n");
        return CLI_EXIT_USAGE;
      }
      const blocker = await claw.blockers.get(id);
      if (!blocker) return CLI_EXIT_FAILURE;
      if (wantsJson) writeJson(context.stdout, blocker);
      else context.stdout.write(`${blocker.status} ${blocker.id} ${blocker.title}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "create") {
      const title = joinedPositionals(positionals, 2) || flags.title;
      if (!title || !flags.kind) {
        context.stderr.write("Usage: claw blockers create <title> --kind waiting_human|waiting_agent|waiting_system|missing_context|policy_block\n");
        return CLI_EXIT_USAGE;
      }
      const blocker = await claw.blockers.create({
        title,
        description: flags.description,
        kind: flags.kind as "waiting_human" | "waiting_agent" | "waiting_system" | "missing_context" | "policy_block",
        status: flags.status as "active" | "resolved" | "cancelled" | undefined,
        taskId: flags["task-id"],
        projectId: flags["project-id"],
        goalId: flags["goal-id"],
        ownerPersonId: flags["owner-person-id"],
        ownerAgentId: flags["owner-agent-id"],
        dependencyTaskIds: parseCsvFlag(flags["dependency-task-ids"]),
        evidenceIds: parseCsvFlag(flags["evidence-ids"]),
        resolvedAt: flags["resolved-at"],
        ...(flags.confidence ? { confidence: Number(flags.confidence) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, blocker);
      else context.stdout.write(`${blocker.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "update") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw blockers update <id> [--title TEXT] [--status STATUS]\n");
        return CLI_EXIT_USAGE;
      }
      const blocker = await claw.blockers.update(id, {
        title: flags.title,
        description: flags.description,
        kind: flags.kind as "waiting_human" | "waiting_agent" | "waiting_system" | "missing_context" | "policy_block" | undefined,
        status: flags.status as "active" | "resolved" | "cancelled" | undefined,
        taskId: flags["task-id"],
        projectId: flags["project-id"],
        goalId: flags["goal-id"],
        ownerPersonId: flags["owner-person-id"],
        ownerAgentId: flags["owner-agent-id"],
        ...(flags["dependency-task-ids"] ? { dependencyTaskIds: parseCsvFlag(flags["dependency-task-ids"]) } : {}),
        ...(flags["evidence-ids"] ? { evidenceIds: parseCsvFlag(flags["evidence-ids"]) } : {}),
        resolvedAt: flags["resolved-at"],
        ...(flags.confidence ? { confidence: Number(flags.confidence) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, blocker);
      else context.stdout.write(`${blocker.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "delete") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw blockers delete <id>\n");
        return CLI_EXIT_USAGE;
      }
      const result = await archiveOrRemoveProductivityRecord(claw.blockers, id, argv, flags, "blockers");
      if (wantsJson) writeJson(context.stdout, result);
      else context.stdout.write("ok\n");
      return CLI_EXIT_OK;
    }
    if (command === "search") {
      const query = subcommand || flags.query;
      if (!query) {
        context.stderr.write("Usage: claw blockers search <query>\n");
        return CLI_EXIT_USAGE;
      }
      const results = await claw.blockers.search(query, {
        strategy: flags.strategy as "auto" | "keyword" | "semantic" | "hybrid" | undefined,
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, results);
      else context.stdout.write(`${results.map((result) => `${result.score.toFixed(1)} ${result.id} ${result.title}`).join("\n")}\n`);
      return results.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
  }

  if (group === "artifacts") {
    const claw = await createCliWorkspaceClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, context.cwd);
    if (command === "list") {
      const artifacts = await claw.artifacts.list({
        ...(flags.kind ? { kind: parseCsvFlag(flags.kind) as Array<"link" | "file" | "command" | "test" | "screenshot" | "message" | "note"> } : {}),
        ...(flags["task-id"] ? { taskId: flags["task-id"] } : {}),
        ...(flags["project-id"] ? { projectId: flags["project-id"] } : {}),
        ...(flags["goal-id"] ? { goalId: flags["goal-id"] } : {}),
        ...(flags["thread-id"] ? { threadId: flags["thread-id"] } : {}),
        ...(flags["decision-id"] ? { decisionId: flags["decision-id"] } : {}),
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
        includeArchived: readBooleanFlag(argv, flags, "include-archived", false),
      });
      if (wantsJson) writeJson(context.stdout, artifacts);
      else context.stdout.write(`${artifacts.map((artifact) => `${artifact.kind} ${artifact.id} ${artifact.title}`).join("\n")}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "get") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw artifacts get <id>\n");
        return CLI_EXIT_USAGE;
      }
      const artifact = await claw.artifacts.get(id);
      if (!artifact) return CLI_EXIT_FAILURE;
      if (wantsJson) writeJson(context.stdout, artifact);
      else context.stdout.write(`${artifact.kind} ${artifact.id} ${artifact.title}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "create") {
      const title = joinedPositionals(positionals, 2) || flags.title;
      if (!title || !flags.kind) {
        context.stderr.write("Usage: claw artifacts create <title> --kind link|file|command|test|screenshot|message|note\n");
        return CLI_EXIT_USAGE;
      }
      const artifact = await claw.artifacts.create({
        title,
        kind: flags.kind as "link" | "file" | "command" | "test" | "screenshot" | "message" | "note",
        taskId: flags["task-id"],
        projectId: flags["project-id"],
        goalId: flags["goal-id"],
        threadId: flags["thread-id"],
        decisionId: flags["decision-id"],
        uri: flags.uri,
        summary: flags.summary,
        content: flags.content,
        ...(flags.confidence ? { confidence: Number(flags.confidence) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, artifact);
      else context.stdout.write(`${artifact.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "update") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw artifacts update <id> [--title TEXT] [--kind KIND]\n");
        return CLI_EXIT_USAGE;
      }
      const artifact = await claw.artifacts.update(id, {
        title: flags.title,
        kind: flags.kind as "link" | "file" | "command" | "test" | "screenshot" | "message" | "note" | undefined,
        taskId: flags["task-id"],
        projectId: flags["project-id"],
        goalId: flags["goal-id"],
        threadId: flags["thread-id"],
        decisionId: flags["decision-id"],
        uri: flags.uri,
        summary: flags.summary,
        content: flags.content,
        ...(flags.confidence ? { confidence: Number(flags.confidence) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, artifact);
      else context.stdout.write(`${artifact.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "delete") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw artifacts delete <id>\n");
        return CLI_EXIT_USAGE;
      }
      const result = await archiveOrRemoveProductivityRecord(claw.artifacts, id, argv, flags, "artifacts");
      if (wantsJson) writeJson(context.stdout, result);
      else context.stdout.write("ok\n");
      return CLI_EXIT_OK;
    }
    if (command === "search") {
      const query = subcommand || flags.query;
      if (!query) {
        context.stderr.write("Usage: claw artifacts search <query>\n");
        return CLI_EXIT_USAGE;
      }
      const results = await claw.artifacts.search(query, {
        strategy: flags.strategy as "auto" | "keyword" | "semantic" | "hybrid" | undefined,
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, results);
      else context.stdout.write(`${results.map((result) => `${result.score.toFixed(1)} ${result.id} ${result.title}`).join("\n")}\n`);
      return results.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
  }

  if (group === "decisions") {
    const claw = await createCliWorkspaceClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, context.cwd);
    if (command === "list") {
      const decisions = await claw.decisions.list({
        ...(flags.status ? { status: parseCsvFlag(flags.status) as Array<"proposed" | "accepted" | "rejected" | "superseded"> } : {}),
        ...(flags["task-id"] ? { taskId: flags["task-id"] } : {}),
        ...(flags["project-id"] ? { projectId: flags["project-id"] } : {}),
        ...(flags["goal-id"] ? { goalId: flags["goal-id"] } : {}),
        ...(flags["owner-person-id"] ? { ownerPersonId: flags["owner-person-id"] } : {}),
        ...(flags["owner-agent-id"] ? { ownerAgentId: flags["owner-agent-id"] } : {}),
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
        includeArchived: readBooleanFlag(argv, flags, "include-archived", false),
      });
      if (wantsJson) writeJson(context.stdout, decisions);
      else context.stdout.write(`${decisions.map((decision) => `${decision.status} ${decision.id} ${decision.title}`).join("\n")}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "get") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw decisions get <id>\n");
        return CLI_EXIT_USAGE;
      }
      const decision = await claw.decisions.get(id);
      if (!decision) return CLI_EXIT_FAILURE;
      if (wantsJson) writeJson(context.stdout, decision);
      else context.stdout.write(`${decision.status} ${decision.id} ${decision.title}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "create") {
      const title = joinedPositionals(positionals, 2) || flags.title;
      if (!title) {
        context.stderr.write("Usage: claw decisions create <title> [--status STATUS]\n");
        return CLI_EXIT_USAGE;
      }
      const decision = await claw.decisions.create({
        title,
        summary: flags.summary,
        status: flags.status as "proposed" | "accepted" | "rejected" | "superseded" | undefined,
        taskId: flags["task-id"],
        projectId: flags["project-id"],
        goalId: flags["goal-id"],
        ownerPersonId: flags["owner-person-id"],
        ownerAgentId: flags["owner-agent-id"],
        outcome: flags.outcome,
        rationale: flags.rationale,
        alternatives: parseCsvFlag(flags.alternatives),
        artifactIds: parseCsvFlag(flags["artifact-ids"]),
        ...(flags.confidence ? { confidence: Number(flags.confidence) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, decision);
      else context.stdout.write(`${decision.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "update") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw decisions update <id> [--title TEXT] [--status STATUS]\n");
        return CLI_EXIT_USAGE;
      }
      const decision = await claw.decisions.update(id, {
        title: flags.title,
        summary: flags.summary,
        status: flags.status as "proposed" | "accepted" | "rejected" | "superseded" | undefined,
        taskId: flags["task-id"],
        projectId: flags["project-id"],
        goalId: flags["goal-id"],
        ownerPersonId: flags["owner-person-id"],
        ownerAgentId: flags["owner-agent-id"],
        outcome: flags.outcome,
        rationale: flags.rationale,
        ...(flags.alternatives ? { alternatives: parseCsvFlag(flags.alternatives) } : {}),
        ...(flags["artifact-ids"] ? { artifactIds: parseCsvFlag(flags["artifact-ids"]) } : {}),
        ...(flags.confidence ? { confidence: Number(flags.confidence) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, decision);
      else context.stdout.write(`${decision.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "delete") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw decisions delete <id>\n");
        return CLI_EXIT_USAGE;
      }
      const result = await archiveOrRemoveProductivityRecord(claw.decisions, id, argv, flags, "decisions");
      if (wantsJson) writeJson(context.stdout, result);
      else context.stdout.write("ok\n");
      return CLI_EXIT_OK;
    }
    if (command === "search") {
      const query = subcommand || flags.query;
      if (!query) {
        context.stderr.write("Usage: claw decisions search <query>\n");
        return CLI_EXIT_USAGE;
      }
      const results = await claw.decisions.search(query, {
        strategy: flags.strategy as "auto" | "keyword" | "semantic" | "hybrid" | undefined,
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, results);
      else context.stdout.write(`${results.map((result) => `${result.score.toFixed(1)} ${result.id} ${result.title}`).join("\n")}\n`);
      return results.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
  }

  if (group === "work-sessions") {
    const claw = await createCliWorkspaceClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, context.cwd);
    if (command === "list") {
      const sessions = await claw.workSessions.list({
        ...(flags.status ? { status: parseCsvFlag(flags.status) as Array<"active" | "completed" | "cancelled"> } : {}),
        ...(flags["task-id"] ? { taskId: flags["task-id"] } : {}),
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
        includeArchived: readBooleanFlag(argv, flags, "include-archived", false),
      });
      if (wantsJson) writeJson(context.stdout, sessions);
      else context.stdout.write(`${sessions.map((session) => `${session.status} ${session.id} ${session.title}`).join("\n")}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "get") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw work-sessions get <id>\n");
        return CLI_EXIT_USAGE;
      }
      const session = await claw.workSessions.get(id);
      if (!session) return CLI_EXIT_FAILURE;
      if (wantsJson) writeJson(context.stdout, session);
      else context.stdout.write(`${session.status} ${session.id} ${session.title}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "create") {
      const title = joinedPositionals(positionals, 2) || flags.title;
      if (!title) {
        context.stderr.write("Usage: claw work-sessions create <title> [--task-ids a,b]\n");
        return CLI_EXIT_USAGE;
      }
      const session = await claw.workSessions.create({
        title,
        status: flags.status as "active" | "completed" | "cancelled" | undefined,
        objective: flags.objective,
        taskIds: parseCsvFlag(flags["task-ids"]),
        blockerIds: parseCsvFlag(flags["blocker-ids"]),
        startedAt: flags["started-at"],
        endedAt: flags["ended-at"],
        outcome: flags.outcome,
        ...(flags["timebox-minutes"] ? { timeboxMinutes: Number(flags["timebox-minutes"]) } : {}),
        ownerAgentId: flags["owner-agent-id"],
        ...(flags.confidence ? { confidence: Number(flags.confidence) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, session);
      else context.stdout.write(`${session.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "update") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw work-sessions update <id> [--title TEXT] [--status STATUS]\n");
        return CLI_EXIT_USAGE;
      }
      const session = await claw.workSessions.update(id, {
        title: flags.title,
        status: flags.status as "active" | "completed" | "cancelled" | undefined,
        objective: flags.objective,
        ...(flags["task-ids"] ? { taskIds: parseCsvFlag(flags["task-ids"]) } : {}),
        ...(flags["blocker-ids"] ? { blockerIds: parseCsvFlag(flags["blocker-ids"]) } : {}),
        startedAt: flags["started-at"],
        endedAt: flags["ended-at"],
        outcome: flags.outcome,
        ...(flags["timebox-minutes"] ? { timeboxMinutes: Number(flags["timebox-minutes"]) } : {}),
        ownerAgentId: flags["owner-agent-id"],
        ...(flags.confidence ? { confidence: Number(flags.confidence) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, session);
      else context.stdout.write(`${session.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "complete" || command === "cancel") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write(`Usage: claw work-sessions ${command} <id>\n`);
        return CLI_EXIT_USAGE;
      }
      const session = command === "complete"
        ? await claw.workSessions.complete(id, flags.outcome)
        : await claw.workSessions.cancel(id);
      if (wantsJson) writeJson(context.stdout, session);
      else context.stdout.write(`${session.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "delete") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw work-sessions delete <id>\n");
        return CLI_EXIT_USAGE;
      }
      const result = await archiveOrRemoveProductivityRecord(claw.workSessions, id, argv, flags, "work-sessions");
      if (wantsJson) writeJson(context.stdout, result);
      else context.stdout.write("ok\n");
      return CLI_EXIT_OK;
    }
    if (command === "search") {
      const query = subcommand || flags.query;
      if (!query) {
        context.stderr.write("Usage: claw work-sessions search <query>\n");
        return CLI_EXIT_USAGE;
      }
      const results = await claw.workSessions.search(query, {
        strategy: flags.strategy as "auto" | "keyword" | "semantic" | "hybrid" | undefined,
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, results);
      else context.stdout.write(`${results.map((result) => `${result.score.toFixed(1)} ${result.id} ${result.title}`).join("\n")}\n`);
      return results.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
  }

  if (group === "assignments") {
    const claw = await createCliWorkspaceClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, context.cwd);
    if (command === "list") {
      const assignments = await claw.assignments.list({
        ...(flags.status ? { status: parseCsvFlag(flags.status) as Array<"proposed" | "accepted" | "rejected" | "released" | "completed"> } : {}),
        ...(flags["task-id"] ? { taskId: flags["task-id"] } : {}),
        ...(flags["project-id"] ? { projectId: flags["project-id"] } : {}),
        ...(flags["goal-id"] ? { goalId: flags["goal-id"] } : {}),
        ...(flags["assigned-to-agent-id"] ? { assignedToAgentId: flags["assigned-to-agent-id"] } : {}),
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
        includeArchived: readBooleanFlag(argv, flags, "include-archived", false),
      });
      if (wantsJson) writeJson(context.stdout, assignments);
      else context.stdout.write(`${assignments.map((assignment) => `${assignment.status} ${assignment.id} ${assignment.title}`).join("\n")}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "get") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw assignments get <id>\n");
        return CLI_EXIT_USAGE;
      }
      const assignment = await claw.assignments.get(id);
      if (!assignment) return CLI_EXIT_FAILURE;
      if (wantsJson) writeJson(context.stdout, assignment);
      else context.stdout.write(`${assignment.status} ${assignment.id} ${assignment.title}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "create") {
      const title = joinedPositionals(positionals, 2) || flags.title;
      const assignedToAgentId = flags["assigned-to-agent-id"];
      if (!title || !assignedToAgentId) {
        context.stderr.write("Usage: claw assignments create <title> --assigned-to-agent-id ID\n");
        return CLI_EXIT_USAGE;
      }
      const assignment = await claw.assignments.create({
        title,
        status: flags.status as "proposed" | "accepted" | "rejected" | "released" | "completed" | undefined,
        taskId: flags["task-id"],
        projectId: flags["project-id"],
        goalId: flags["goal-id"],
        assignedToAgentId,
        assignedBy: flags["assigned-by"],
        delegatedBy: flags["delegated-by"],
        reviewerAgentId: flags["reviewer-agent-id"],
        rationale: flags.rationale,
        rejectionReason: flags["rejection-reason"],
        acceptedAt: flags["accepted-at"],
        rejectedAt: flags["rejected-at"],
        completedAt: flags["completed-at"],
        dueAt: flags["due-at"],
        priority: flags.priority as "low" | "medium" | "high" | "urgent" | undefined,
        ...(flags.confidence ? { confidence: Number(flags.confidence) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, assignment);
      else context.stdout.write(`${assignment.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "update") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw assignments update <id> [--status STATUS]\n");
        return CLI_EXIT_USAGE;
      }
      const assignment = await claw.assignments.update(id, {
        title: flags.title,
        status: flags.status as "proposed" | "accepted" | "rejected" | "released" | "completed" | undefined,
        taskId: flags["task-id"],
        projectId: flags["project-id"],
        goalId: flags["goal-id"],
        assignedToAgentId: flags["assigned-to-agent-id"],
        assignedBy: flags["assigned-by"],
        delegatedBy: flags["delegated-by"],
        reviewerAgentId: flags["reviewer-agent-id"],
        rationale: flags.rationale,
        rejectionReason: flags["rejection-reason"],
        acceptedAt: flags["accepted-at"],
        rejectedAt: flags["rejected-at"],
        completedAt: flags["completed-at"],
        dueAt: flags["due-at"],
        priority: flags.priority as "low" | "medium" | "high" | "urgent" | undefined,
        ...(flags.confidence ? { confidence: Number(flags.confidence) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, assignment);
      else context.stdout.write(`${assignment.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "delete") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw assignments delete <id>\n");
        return CLI_EXIT_USAGE;
      }
      const result = await archiveOrRemoveProductivityRecord(claw.assignments, id, argv, flags, "assignments");
      if (wantsJson) writeJson(context.stdout, result);
      else context.stdout.write("ok\n");
      return CLI_EXIT_OK;
    }
    if (command === "search") {
      const query = subcommand || flags.query;
      if (!query) {
        context.stderr.write("Usage: claw assignments search <query>\n");
        return CLI_EXIT_USAGE;
      }
      const results = await claw.assignments.search(query, {
        strategy: flags.strategy as "auto" | "keyword" | "semantic" | "hybrid" | undefined,
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, results);
      else context.stdout.write(`${results.map((result) => `${result.score.toFixed(1)} ${result.id} ${result.title}`).join("\n")}\n`);
      return results.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
  }

  if (group === "handoffs") {
    const claw = await createCliWorkspaceClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, context.cwd);
    if (command === "list") {
      const handoffs = await claw.handoffs.list({
        ...(flags.status ? { status: parseCsvFlag(flags.status) as Array<"proposed" | "accepted" | "rejected" | "returned" | "completed"> } : {}),
        ...(flags["task-id"] ? { taskId: flags["task-id"] } : {}),
        ...(flags["project-id"] ? { projectId: flags["project-id"] } : {}),
        ...(flags["goal-id"] ? { goalId: flags["goal-id"] } : {}),
        ...(flags["from-agent-id"] ? { fromAgentId: flags["from-agent-id"] } : {}),
        ...(flags["to-agent-id"] ? { toAgentId: flags["to-agent-id"] } : {}),
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
        includeArchived: readBooleanFlag(argv, flags, "include-archived", false),
      });
      if (wantsJson) writeJson(context.stdout, handoffs);
      else context.stdout.write(`${handoffs.map((handoff) => `${handoff.status} ${handoff.id} ${handoff.title}`).join("\n")}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "get") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw handoffs get <id>\n");
        return CLI_EXIT_USAGE;
      }
      const handoff = await claw.handoffs.get(id);
      if (!handoff) return CLI_EXIT_FAILURE;
      if (wantsJson) writeJson(context.stdout, handoff);
      else context.stdout.write(`${handoff.status} ${handoff.id} ${handoff.title}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "create") {
      const title = joinedPositionals(positionals, 2) || flags.title;
      if (!title || !flags["from-agent-id"] || !flags["to-agent-id"]) {
        context.stderr.write("Usage: claw handoffs create <title> --from-agent-id ID --to-agent-id ID\n");
        return CLI_EXIT_USAGE;
      }
      const handoff = await claw.handoffs.create({
        title,
        status: flags.status as "proposed" | "accepted" | "rejected" | "returned" | "completed" | undefined,
        taskId: flags["task-id"],
        projectId: flags["project-id"],
        goalId: flags["goal-id"],
        fromAgentId: flags["from-agent-id"],
        toAgentId: flags["to-agent-id"],
        objective: flags.objective,
        currentState: flags["current-state"],
        contextSummary: flags["context-summary"],
        nextStep: flags["next-step"],
        riskSummary: flags["risk-summary"],
        artifactIds: parseCsvFlag(flags["artifact-ids"]),
        blockerIds: parseCsvFlag(flags["blocker-ids"]),
        approvalId: flags["approval-id"],
        rejectionReason: flags["rejection-reason"],
        acceptedAt: flags["accepted-at"],
        completedAt: flags["completed-at"],
        ...(flags.confidence ? { confidence: Number(flags.confidence) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, handoff);
      else context.stdout.write(`${handoff.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "update") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw handoffs update <id> [--status STATUS]\n");
        return CLI_EXIT_USAGE;
      }
      const handoff = await claw.handoffs.update(id, {
        title: flags.title,
        status: flags.status as "proposed" | "accepted" | "rejected" | "returned" | "completed" | undefined,
        taskId: flags["task-id"],
        projectId: flags["project-id"],
        goalId: flags["goal-id"],
        fromAgentId: flags["from-agent-id"],
        toAgentId: flags["to-agent-id"],
        objective: flags.objective,
        currentState: flags["current-state"],
        contextSummary: flags["context-summary"],
        nextStep: flags["next-step"],
        riskSummary: flags["risk-summary"],
        ...(flags["artifact-ids"] ? { artifactIds: parseCsvFlag(flags["artifact-ids"]) } : {}),
        ...(flags["blocker-ids"] ? { blockerIds: parseCsvFlag(flags["blocker-ids"]) } : {}),
        approvalId: flags["approval-id"],
        rejectionReason: flags["rejection-reason"],
        acceptedAt: flags["accepted-at"],
        completedAt: flags["completed-at"],
        ...(flags.confidence ? { confidence: Number(flags.confidence) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, handoff);
      else context.stdout.write(`${handoff.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "delete") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw handoffs delete <id>\n");
        return CLI_EXIT_USAGE;
      }
      const result = await archiveOrRemoveProductivityRecord(claw.handoffs, id, argv, flags, "handoffs");
      if (wantsJson) writeJson(context.stdout, result);
      else context.stdout.write("ok\n");
      return CLI_EXIT_OK;
    }
    if (command === "search") {
      const query = subcommand || flags.query;
      if (!query) {
        context.stderr.write("Usage: claw handoffs search <query>\n");
        return CLI_EXIT_USAGE;
      }
      const results = await claw.handoffs.search(query, {
        strategy: flags.strategy as "auto" | "keyword" | "semantic" | "hybrid" | undefined,
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, results);
      else context.stdout.write(`${results.map((result) => `${result.score.toFixed(1)} ${result.id} ${result.title}`).join("\n")}\n`);
      return results.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
  }

  if (group === "approvals") {
    const claw = await createCliWorkspaceClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, context.cwd);
    if (command === "list") {
      const approvals = await claw.approvals.list({
        ...(flags.status ? { status: parseCsvFlag(flags.status) as Array<"pending" | "approved" | "rejected" | "cancelled"> } : {}),
        ...(flags.kind ? { kind: parseCsvFlag(flags.kind) as Array<"deploy" | "publish" | "delete" | "external_send" | "spend" | "policy_gate" | "other"> } : {}),
        ...(flags["task-id"] ? { taskId: flags["task-id"] } : {}),
        ...(flags["project-id"] ? { projectId: flags["project-id"] } : {}),
        ...(flags["goal-id"] ? { goalId: flags["goal-id"] } : {}),
        ...(flags["handoff-id"] ? { handoffId: flags["handoff-id"] } : {}),
        ...(flags["approver-agent-id"] ? { approverAgentId: flags["approver-agent-id"] } : {}),
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
        includeArchived: readBooleanFlag(argv, flags, "include-archived", false),
      });
      if (wantsJson) writeJson(context.stdout, approvals);
      else context.stdout.write(`${approvals.map((approval) => `${approval.status} ${approval.id} ${approval.title}`).join("\n")}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "get") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw approvals get <id>\n");
        return CLI_EXIT_USAGE;
      }
      const approval = await claw.approvals.get(id);
      if (!approval) return CLI_EXIT_FAILURE;
      if (wantsJson) writeJson(context.stdout, approval);
      else context.stdout.write(`${approval.status} ${approval.id} ${approval.title}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "create") {
      const title = joinedPositionals(positionals, 2) || flags.title;
      if (!title || !flags.kind || !flags["policy-reason"]) {
        context.stderr.write("Usage: claw approvals create <title> --kind publish|deploy|delete|external_send|spend|policy_gate|other --policy-reason TEXT\n");
        return CLI_EXIT_USAGE;
      }
      const approval = await claw.approvals.create({
        title,
        status: flags.status as "pending" | "approved" | "rejected" | "cancelled" | undefined,
        kind: flags.kind as "deploy" | "publish" | "delete" | "external_send" | "spend" | "policy_gate" | "other",
        taskId: flags["task-id"],
        projectId: flags["project-id"],
        goalId: flags["goal-id"],
        handoffId: flags["handoff-id"],
        requestedByAgentId: flags["requested-by-agent-id"],
        approverAgentId: flags["approver-agent-id"],
        policyReason: flags["policy-reason"],
        evidenceIds: parseCsvFlag(flags["evidence-ids"]),
        decisionIds: parseCsvFlag(flags["decision-ids"]),
        approvedBy: flags["approved-by"],
        outcome: flags.outcome,
        approvedAt: flags["approved-at"],
        rejectedAt: flags["rejected-at"],
        ...(flags.confidence ? { confidence: Number(flags.confidence) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, approval);
      else context.stdout.write(`${approval.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "update") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw approvals update <id> [--status STATUS]\n");
        return CLI_EXIT_USAGE;
      }
      const approval = await claw.approvals.update(id, {
        title: flags.title,
        status: flags.status as "pending" | "approved" | "rejected" | "cancelled" | undefined,
        kind: flags.kind as "deploy" | "publish" | "delete" | "external_send" | "spend" | "policy_gate" | "other" | undefined,
        taskId: flags["task-id"],
        projectId: flags["project-id"],
        goalId: flags["goal-id"],
        handoffId: flags["handoff-id"],
        requestedByAgentId: flags["requested-by-agent-id"],
        approverAgentId: flags["approver-agent-id"],
        policyReason: flags["policy-reason"],
        ...(flags["evidence-ids"] ? { evidenceIds: parseCsvFlag(flags["evidence-ids"]) } : {}),
        ...(flags["decision-ids"] ? { decisionIds: parseCsvFlag(flags["decision-ids"]) } : {}),
        approvedBy: flags["approved-by"],
        outcome: flags.outcome,
        approvedAt: flags["approved-at"],
        rejectedAt: flags["rejected-at"],
        ...(flags.confidence ? { confidence: Number(flags.confidence) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, approval);
      else context.stdout.write(`${approval.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "delete") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw approvals delete <id>\n");
        return CLI_EXIT_USAGE;
      }
      const result = await archiveOrRemoveProductivityRecord(claw.approvals, id, argv, flags, "approvals");
      if (wantsJson) writeJson(context.stdout, result);
      else context.stdout.write("ok\n");
      return CLI_EXIT_OK;
    }
    if (command === "search") {
      const query = subcommand || flags.query;
      if (!query) {
        context.stderr.write("Usage: claw approvals search <query>\n");
        return CLI_EXIT_USAGE;
      }
      const results = await claw.approvals.search(query, {
        strategy: flags.strategy as "auto" | "keyword" | "semantic" | "hybrid" | undefined,
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, results);
      else context.stdout.write(`${results.map((result) => `${result.score.toFixed(1)} ${result.id} ${result.title}`).join("\n")}\n`);
      return results.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
  }

  if (group === "capacity") {
    const claw = await createCliWorkspaceClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, context.cwd);
    if (command === "list") {
      const capacity = await claw.capacity.list({
        ...(flags.status ? { status: parseCsvFlag(flags.status) as Array<"active" | "limited" | "overloaded" | "offline"> } : {}),
        ...(flags.availability ? { availability: parseCsvFlag(flags.availability) as Array<"available" | "busy" | "away" | "offline"> } : {}),
        ...(flags["team-id"] ? { teamId: flags["team-id"] } : {}),
        ...(flags["agent-id"] ? { agentId: flags["agent-id"] } : {}),
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
        includeArchived: readBooleanFlag(argv, flags, "include-archived", false),
      });
      if (wantsJson) writeJson(context.stdout, capacity);
      else context.stdout.write(`${capacity.map((snapshot) => `${snapshot.status} ${snapshot.id} ${snapshot.title}`).join("\n")}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "get") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw capacity get <id>\n");
        return CLI_EXIT_USAGE;
      }
      const snapshot = await claw.capacity.get(id);
      if (!snapshot) return CLI_EXIT_FAILURE;
      if (wantsJson) writeJson(context.stdout, snapshot);
      else context.stdout.write(`${snapshot.status} ${snapshot.id} ${snapshot.title}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "create") {
      const title = joinedPositionals(positionals, 2) || flags.title;
      const agentIdFlag = flags["agent-id"];
      if (!title || !agentIdFlag) {
        context.stderr.write("Usage: claw capacity create <title> --agent-id ID\n");
        return CLI_EXIT_USAGE;
      }
      const snapshot = await claw.capacity.create({
        title,
        status: flags.status as "active" | "limited" | "overloaded" | "offline" | undefined,
        agentId: agentIdFlag,
        teamId: flags["team-id"],
        role: flags.role,
        availability: flags.availability as "available" | "busy" | "away" | "offline" | undefined,
        ...(flags["max-wip"] ? { maxWip: Number(flags["max-wip"]) } : {}),
        ...(flags["current-wip"] ? { currentWip: Number(flags["current-wip"]) } : {}),
        ...(flags["queue-depth"] ? { queueDepth: Number(flags["queue-depth"]) } : {}),
        ...(flags["blocked-count"] ? { blockedCount: Number(flags["blocked-count"]) } : {}),
        ...(flags["overdue-count"] ? { overdueCount: Number(flags["overdue-count"]) } : {}),
        ...(flags["response-latency-minutes"] ? { responseLatencyMinutes: Number(flags["response-latency-minutes"]) } : {}),
        ...(flags.utilization ? { utilization: Number(flags.utilization) } : {}),
        assignedTaskIds: parseCsvFlag(flags["assigned-task-ids"]),
        pendingApprovalIds: parseCsvFlag(flags["pending-approval-ids"]),
        pendingHandoffIds: parseCsvFlag(flags["pending-handoff-ids"]),
        snapshotAt: flags["snapshot-at"],
        ...(flags.confidence ? { confidence: Number(flags.confidence) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, snapshot);
      else context.stdout.write(`${snapshot.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "update") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw capacity update <id>\n");
        return CLI_EXIT_USAGE;
      }
      const snapshot = await claw.capacity.update(id, {
        title: flags.title,
        status: flags.status as "active" | "limited" | "overloaded" | "offline" | undefined,
        agentId: flags["agent-id"],
        teamId: flags["team-id"],
        role: flags.role,
        availability: flags.availability as "available" | "busy" | "away" | "offline" | undefined,
        ...(flags["max-wip"] ? { maxWip: Number(flags["max-wip"]) } : {}),
        ...(flags["current-wip"] ? { currentWip: Number(flags["current-wip"]) } : {}),
        ...(flags["queue-depth"] ? { queueDepth: Number(flags["queue-depth"]) } : {}),
        ...(flags["blocked-count"] ? { blockedCount: Number(flags["blocked-count"]) } : {}),
        ...(flags["overdue-count"] ? { overdueCount: Number(flags["overdue-count"]) } : {}),
        ...(flags["response-latency-minutes"] ? { responseLatencyMinutes: Number(flags["response-latency-minutes"]) } : {}),
        ...(flags.utilization ? { utilization: Number(flags.utilization) } : {}),
        ...(flags["assigned-task-ids"] ? { assignedTaskIds: parseCsvFlag(flags["assigned-task-ids"]) } : {}),
        ...(flags["pending-approval-ids"] ? { pendingApprovalIds: parseCsvFlag(flags["pending-approval-ids"]) } : {}),
        ...(flags["pending-handoff-ids"] ? { pendingHandoffIds: parseCsvFlag(flags["pending-handoff-ids"]) } : {}),
        snapshotAt: flags["snapshot-at"],
        ...(flags.confidence ? { confidence: Number(flags.confidence) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, snapshot);
      else context.stdout.write(`${snapshot.id}\n`);
      return CLI_EXIT_OK;
    }
    if (command === "delete") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw capacity delete <id>\n");
        return CLI_EXIT_USAGE;
      }
      const result = await archiveOrRemoveProductivityRecord(claw.capacity, id, argv, flags, "capacity");
      if (wantsJson) writeJson(context.stdout, result);
      else context.stdout.write("ok\n");
      return CLI_EXIT_OK;
    }
    if (command === "search") {
      const query = subcommand || flags.query;
      if (!query) {
        context.stderr.write("Usage: claw capacity search <query>\n");
        return CLI_EXIT_USAGE;
      }
      const results = await claw.capacity.search(query, {
        strategy: flags.strategy as "auto" | "keyword" | "semantic" | "hybrid" | undefined,
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      });
      if (wantsJson) writeJson(context.stdout, results);
      else context.stdout.write(`${results.map((result) => `${result.score.toFixed(1)} ${result.id} ${result.title}`).join("\n")}\n`);
      return results.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
  }

  if (group === "reminders") {
    if (command === "after") {
      const expression = subcommand;
      const title = joinedPositionals(positionals, 3) || flags.title;
      if (!expression || !title) {
        context.stderr.write("Usage: claw reminders after <duration> <title>\n");
        return CLI_EXIT_USAGE;
      }
      if (parseSimpleDurationMs(expression) === null) {
        throw new CliHandledError("invalid_duration", `Unsupported duration "${expression}". Use simple durations like 30m, 24h, or 2d.`, CLI_EXIT_USAGE);
      }
      const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
      const payload = await claw.reminders.after({
        title,
        after: expression,
        description: flags.description,
        timezone: flags.timezone,
        workspaceId,
        ...(flags["project-id"] ? { projectId: flags["project-id"] } : {}),
        ...(flags["agent-id"] ? { agentId: flags["agent-id"] } : {}),
        ...(flags["anchor-type"] ? { anchorType: flags["anchor-type"] as never } : {}),
        ...(flags["anchor-id"] ? { anchorId: flags["anchor-id"] } : {}),
        ...(flags["anchor-at"] ? { anchorAt: flags["anchor-at"] } : {}),
      });
      if (wantsJson) writeJson(context.stdout, payload);
      else writeTemporalItems(context.stdout, [payload.item]);
      return CLI_EXIT_OK;
    }
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
      return CLI_EXIT_OK;
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
      const title = joinedPositionals(positionals, 2) || flags.title;
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
      const result = await archiveOrRemoveProductivityRecord(claw.reminders, id, argv, flags, "reminders");
      if (wantsJson) writeJson(context.stdout, result);
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
      return CLI_EXIT_OK;
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
      const title = joinedPositionals(positionals, 2) || flags.title;
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
      const result = await archiveOrRemoveProductivityRecord(claw.deadlines, id, argv, flags, "deadlines");
      if (wantsJson) writeJson(context.stdout, result);
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
      return CLI_EXIT_OK;
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
      const title = joinedPositionals(positionals, 2) || flags.title;
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
      return CLI_EXIT_OK;
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
      const displayName = joinedPositionals(positionals, 2) || flags.name || flags.title;
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
      return CLI_EXIT_OK;
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
    if (command === "process") {
      const id = subcommand || flags.id;
      if (!id) {
        context.stderr.write("Usage: claw inbox process <thread-id> [--task-title TEXT] [--note-title TEXT] [--reminder-title TEXT --trigger-at ISO]\n");
        return CLI_EXIT_USAGE;
      }
      const processed = await claw.inbox.process(id, {
        taskTitle: flags["task-title"],
        noteTitle: flags["note-title"],
        reminderTitle: flags["reminder-title"],
        reminderAt: flags["trigger-at"],
        areaId: flags["area-id"],
        projectId: flags["project-id"],
        goalId: flags["goal-id"],
      });
      if (wantsJson) writeJson(context.stdout, processed);
      else context.stdout.write(`${processed.thread.id}\n`);
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
      return CLI_EXIT_OK;
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
      domains: parseCsvFlag(flags.domains) as Array<"areas" | "tasks" | "goals" | "projects" | "milestones" | "activity" | "blockers" | "artifacts" | "decisions" | "work_sessions" | "assignments" | "handoffs" | "approvals" | "capacity" | "reminders" | "deadlines" | "notes" | "people" | "inbox" | "events">,
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

  if (group === "outcomes") {
    return await runOutcomesCli({
      argv,
      positionals,
      flags,
      context,
      wantsJson,
      binName,
      workspaceRoot,
      appId,
      workspaceId,
      agentId,
      runtimeAdapterId,
    });
  }

  if (group === "context") {
    return await runContextCli({
      argv,
      positionals,
      flags,
      context,
      wantsJson,
      binName,
      workspaceRoot,
      appId,
      workspaceId,
      agentId,
      runtimeAdapterId,
    });
  }

  if (group === "commitments") {
    return await runCommitmentsCli({
      argv,
      positionals,
      flags,
      context,
      wantsJson,
      binName,
      workspaceRoot,
      appId,
      workspaceId,
      agentId,
      runtimeAdapterId,
    });
  }

  if (group === "judgment") {
    return await runJudgmentCli({
      argv,
      positionals,
      flags,
      context,
      wantsJson,
      binName,
      workspaceRoot,
      appId,
      workspaceId,
      agentId,
      runtimeAdapterId,
    });
  }

  if (group === "learning") {
    return await runLearningCli({
      argv,
      positionals,
      flags,
      context,
      wantsJson,
      binName,
      workspaceRoot,
      appId,
      workspaceId,
      agentId,
      runtimeAdapterId,
    });
  }

  if (group === "soul") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, argv);
    const targetSoulId = subcommand || flags.id;
    const targetAgentId = flags.agent || flags["agent-id"] || agentId;

    try {
      if (command === "init") {
        const modules = parseSoulModulesFromSetFlags(argv);
        const spec = claw.soul.init({
          id: targetSoulId || "default",
          title: flags.title,
          description: flags.description,
          presetId: flags.preset || flags["preset-id"],
          ...(Object.keys(modules).length ? { modules } : {}),
        });
        if (wantsJson) writeJson(context.stdout, spec);
        else context.stdout.write(`initialized soul ${spec.id}\n`);
        return CLI_EXIT_OK;
      }

      if (command === "inspect") {
        const result = claw.soul.inspect(targetSoulId, flags.agent ? targetAgentId : undefined);
        if (wantsJson) writeJson(context.stdout, result);
        else context.stdout.write(`${targetSoulId ? result.resolved?.title ?? "not found" : `${result.state.specs.length} souls`}\n`);
        return targetSoulId && !result.resolved ? CLI_EXIT_FAILURE : CLI_EXIT_OK;
      }

      if (command === "validate") {
        const spec = targetSoulId ? claw.soul.resolve({ soulId: targetSoulId }) : claw.soul.resolve({ agentId: targetAgentId });
        const result = claw.soul.validate(spec);
        if (wantsJson) writeJson(context.stdout, result);
        else context.stdout.write(result.ok ? "valid\n" : `${result.issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n")}\n`);
        return result.ok ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
      }

      if (command === "preview") {
        const result = claw.soul.preview({
          ...(targetSoulId ? { soulId: targetSoulId } : {}),
          agentId: targetAgentId,
        });
        if (wantsJson) writeJson(context.stdout, result);
        else context.stdout.write(result.markdown);
        return CLI_EXIT_OK;
      }

      if (command === "compile") {
        const result = claw.soul.compile({
          ...(targetSoulId ? { soulId: targetSoulId } : {}),
          agentId: targetAgentId,
        });
        if (wantsJson) writeJson(context.stdout, result);
        else context.stdout.write(`compiled ${result.soulId} to ${result.targetFile}\n`);
        return CLI_EXIT_OK;
      }

      if (command === "assign") {
        const soulId = targetSoulId || flags["soul-id"];
        if (!soulId || !targetAgentId) {
          context.stderr.write("Usage: claw soul assign <soul-id> --agent ID [--compile]\n");
          return CLI_EXIT_USAGE;
        }
        const assignment = claw.soul.assign({
          soulId,
          agentId: targetAgentId,
        });
        const compiled = readBooleanFlag(argv, flags, "compile", false)
          ? claw.soul.compile({ agentId: targetAgentId })
          : null;
        if (wantsJson) writeJson(context.stdout, { assignment, compiled });
        else context.stdout.write(`assigned ${assignment.soulId} to ${assignment.agentId}\n`);
        return CLI_EXIT_OK;
      }
    } catch (error) {
      context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return CLI_EXIT_FAILURE;
    }

    context.stderr.write("Usage: claw soul init|validate|preview|compile|assign|inspect ...\n");
    return CLI_EXIT_USAGE;
  }

  if (group === "user") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, argv);
    const targetUserId = flags.user || flags["user-id"];
    const targetAgentId = flags.agent || flags["agent-id"] || agentId;
    const metadata = parseUserMetadataFlags(flags);

    try {
      if (command === "init") {
        const user = claw.user.init({
          id: subcommand || targetUserId || "user",
          displayName: flags.name || flags["display-name"] || flags.title,
          ...(readBooleanFlag(argv, flags, "default", false) ? { isDefault: true } : {}),
        });
        if (wantsJson) writeJson(context.stdout, user);
        else context.stdout.write(`initialized user ${user.id}\n`);
        return CLI_EXIT_OK;
      }

      if (command === "list") {
        const users = claw.user.list();
        if (wantsJson) writeJson(context.stdout, { users });
        else context.stdout.write(`${users.map((user) => `${user.id} ${user.displayName}${user.isDefault ? " default" : ""}`).join("\n")}\n`);
        return CLI_EXIT_OK;
      }

      if (command === "get" || command === "inspect") {
        const id = subcommand || targetUserId;
        const result = command === "inspect"
          ? claw.user.inspect(id, flags.agent ? targetAgentId : undefined)
          : { user: id ? claw.user.get(id) : claw.user.resolve({ userId: targetUserId, agentId: flags.agent ? targetAgentId : undefined }) };
        if (wantsJson) writeJson(context.stdout, result);
        else if (command === "inspect") context.stdout.write(`${id ? (result as ReturnType<typeof claw.user.inspect>).resolved?.displayName ?? "not found" : `${(result as ReturnType<typeof claw.user.inspect>).state.specs.length} users`}\n`);
        else context.stdout.write(`${((result as { user: { id: string; displayName: string } | null }).user)?.id ?? "not found"}\n`);
        return CLI_EXIT_OK;
      }

      if (command === "pack") {
        const action = subcommand || "list";
        const packId = (positionals[3] || flags.id || flags.pack) as UserPackId | undefined;
        if (action === "list") {
          const packs = claw.user.packs(targetUserId);
          if (wantsJson) writeJson(context.stdout, { packs });
          else context.stdout.write(`${packs.map((pack) => `${pack.enabled ? "*" : "-"} ${pack.id} v${pack.schemaVersion}`).join("\n")}\n`);
          return CLI_EXIT_OK;
        }
        if (!packId || (action !== "enable" && action !== "disable")) {
          context.stderr.write("Usage: claw user pack list|enable|disable [pack-id] [--user ID]\n");
          return CLI_EXIT_USAGE;
        }
        const pack = action === "enable"
          ? claw.user.enablePack({ userId: targetUserId, id: packId })
          : claw.user.disablePack({ userId: targetUserId, id: packId });
        if (wantsJson) writeJson(context.stdout, pack);
        else context.stdout.write(`${pack.enabled ? "enabled" : "disabled"} ${pack.id}\n`);
        return CLI_EXIT_OK;
      }

      if (command === "domains") {
        const action = subcommand || "list";
        const domainId = (positionals[3] || flags.id || flags.domain) as UserDomainId | undefined;
        if (action === "list") {
          const domains = claw.user.domains(targetUserId);
          if (wantsJson) writeJson(context.stdout, { domains });
          else context.stdout.write(`${domains.map((domain) => `${domain.enabled ? "*" : "-"} ${domain.id} ${domain.sensitivity}`).join("\n")}\n`);
          return CLI_EXIT_OK;
        }
        if (action === "inspect") {
          const domains = claw.user.domains(targetUserId);
          const domain = domainId ? domains.find((entry) => entry.id === domainId) : domains;
          if (wantsJson) writeJson(context.stdout, domain);
          else context.stdout.write(`${Array.isArray(domain) ? domain.map((entry) => entry.id).join("\n") : domain ? `${domain.id} ${domain.pack}` : "not found"}\n`);
          return domain ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
        }
        if (!domainId || (action !== "enable" && action !== "disable")) {
          context.stderr.write("Usage: claw user domains list|enable|disable|inspect [domain-id] [--user ID]\n");
          return CLI_EXIT_USAGE;
        }
        const domain = action === "enable" ? claw.user.enableDomain({ userId: targetUserId, id: domainId }) : claw.user.disableDomain({ userId: targetUserId, id: domainId });
        if (wantsJson) writeJson(context.stdout, domain);
        else context.stdout.write(`${domain.enabled ? "enabled" : "disabled"} ${domain.id}\n`);
        return CLI_EXIT_OK;
      }

      if (command === "wizard") {
        const domain = (subcommand || flags.domain) as UserPackId | UserDomainId | undefined;
        const title = flags.title || joinedPositionals(positionals, 3);
        if (!domain || !title) {
          context.stderr.write("Usage: claw user wizard <domain> --title TEXT [--set key=value ...] [--user ID]\n");
          return CLI_EXIT_USAGE;
        }
        const proposal = claw.user.wizard({
          userId: targetUserId,
          domain,
          title,
          fields: parseUserFieldsFromSetFlags(argv),
          ...metadata,
        });
        if (wantsJson) writeJson(context.stdout, proposal);
        else context.stdout.write(`proposed ${proposal.id}\n`);
        return CLI_EXIT_OK;
      }

      if (command === "entity") {
        const action = subcommand || "list";
        if (action === "list") {
          const entities = claw.user.listEntities({
            userId: targetUserId,
            ...(flags.type ? { type: flags.type as UserEntityType } : {}),
          });
          if (wantsJson) writeJson(context.stdout, { entities });
          else context.stdout.write(`${entities.map((entity) => `${entity.id} ${entity.type} ${entity.title}`).join("\n")}\n`);
          return CLI_EXIT_OK;
        }
        if (action === "get") {
          const entityId = positionals[3] || flags.id;
          if (!entityId) {
            context.stderr.write("Usage: claw user entity get <id> [--user ID]\n");
            return CLI_EXIT_USAGE;
          }
          const entity = claw.user.getEntity(entityId, targetUserId);
          if (wantsJson) writeJson(context.stdout, entity);
          else context.stdout.write(`${entity?.id ?? "not found"}\n`);
          return entity ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
        }
        if (action === "add") {
          const type = (positionals[3] || flags.type) as UserEntityType | undefined;
          const title = flags.title || joinedPositionals(positionals, 4);
          if (!type || !title) {
            context.stderr.write("Usage: claw user entity add <entity-type> --title TEXT [--set key=value ...] [--user ID]\n");
            return CLI_EXIT_USAGE;
          }
          const entity = claw.user.addEntity({
            userId: targetUserId,
            type,
            title,
            fields: parseUserFieldsFromSetFlags(argv),
            ...metadata,
          });
          if (wantsJson) writeJson(context.stdout, entity);
          else context.stdout.write(`added ${entity.type} ${entity.id}\n`);
          return CLI_EXIT_OK;
        }
        context.stderr.write("Usage: claw user entity add|get|list ...\n");
        return CLI_EXIT_USAGE;
      }

      if (command === "link") {
        const from = subcommand || flags.from;
        const relation = positionals[3] || flags.relation;
        const to = positionals[4] || flags.to;
        if (!from || !relation || !to) {
          context.stderr.write("Usage: claw user link <from-entity-id> <relation> <to-entity-id> [--user ID]\n");
          return CLI_EXIT_USAGE;
        }
        const link = claw.user.link({
          userId: targetUserId,
          from,
          relation,
          to,
          ...metadata,
        });
        if (wantsJson) writeJson(context.stdout, link);
        else context.stdout.write(`linked ${link.id}\n`);
        return CLI_EXIT_OK;
      }

      if (command === "query") {
        const result = claw.user.query({
          userId: targetUserId,
          ...(flags.domain ? { domain: flags.domain as UserPackId | UserDomainId } : {}),
          ...(flags.type ? { type: flags.type } : {}),
          ...(flags.status ? { status: flags.status } : {}),
          ...(flags.sensitivity ? { sensitivity: flags.sensitivity as UserFactSensitivity } : {}),
          ...(flags.source ? { source: flags.source } : {}),
          ...(flags.date ? { date: flags.date } : {}),
          ...(flags.text ? { text: flags.text } : {}),
        });
        if (wantsJson) writeJson(context.stdout, result);
        else {
          const rows = [
            ...result.facts.map((fact) => `fact ${fact.facet}.${fact.key} ${JSON.stringify(fact.value)}`),
            ...result.records.map((record) => `record ${record.type} ${record.id} ${record.title}`),
            ...result.customFacts.map((fact) => `custom ${fact.id} ${fact.title}`),
            ...result.proposals.map((proposal) => `proposal ${proposal.status} ${proposal.id}`),
            ...result.entities.map((entity) => `entity ${entity.type} ${entity.id} ${entity.title}`),
            ...result.links.map((link) => `link ${link.id} ${link.from} ${link.relation} ${link.to}`),
          ];
          context.stdout.write(`${rows.join("\n")}\n`);
        }
        return CLI_EXIT_OK;
      }

      if (command === "review") {
        const action = subcommand || "list";
        const proposalId = positionals[3] || flags.id;
        if (action === "list") {
          const proposals = claw.user.review.list({ userId: targetUserId, ...(flags.status ? { status: flags.status as "pending" | "verified" | "rejected" } : {}) });
          if (wantsJson) writeJson(context.stdout, { proposals });
          else context.stdout.write(`${proposals.map((proposal) => `${proposal.status} ${proposal.id} ${proposal.title ?? proposal.path ?? proposal.recordType ?? proposal.kind}`).join("\n")}\n`);
          return CLI_EXIT_OK;
        }
        if (!proposalId && action !== "approve-many") {
          context.stderr.write("Usage: claw user review list|show|approve|reject|edit|approve-many [proposal-id]\n");
          return CLI_EXIT_USAGE;
        }
        if (action === "show") {
          const proposal = claw.user.review.show(proposalId, targetUserId);
          if (wantsJson) writeJson(context.stdout, proposal);
          else context.stdout.write(`${proposal.status} ${proposal.id}\n`);
          return CLI_EXIT_OK;
        }
        if (action === "approve") {
          const proposal = claw.user.review.approve(proposalId, targetUserId);
          if (wantsJson) writeJson(context.stdout, proposal);
          else context.stdout.write(`approved ${proposal.id}\n`);
          return CLI_EXIT_OK;
        }
        if (action === "reject") {
          const proposal = claw.user.review.reject(proposalId, targetUserId, flags.reason || flags.notes);
          if (wantsJson) writeJson(context.stdout, proposal);
          else context.stdout.write(`rejected ${proposal.id}\n`);
          return CLI_EXIT_OK;
        }
        if (action === "edit") {
          const patch = {
            ...(flags.path ? { path: flags.path } : {}),
            ...(flags.value !== undefined ? { value: parseUserFactValue(flags.value, "proposal value") } : {}),
            ...(flags["record-type"] || flags.type ? { recordType: (flags["record-type"] || flags.type) as UserRecordType } : {}),
            ...(flags.title ? { title: flags.title } : {}),
            ...(flags.domain ? { domain: flags.domain as UserDomainId } : {}),
            ...(flags.source ? { source: flags.source } : {}),
            ...(flags.sensitivity ? { sensitivity: flags.sensitivity as UserFactSensitivity } : {}),
            ...(flags.confidence ? { confidence: Number(flags.confidence) } : {}),
            ...(flags.notes ? { notes: flags.notes } : {}),
            ...(flags.visibility ? { visibility: flags.visibility as "agent" | "public" | "private" } : {}),
            ...(argv.includes("--set") ? { fields: parseUserFieldsFromSetFlags(argv) } : {}),
          };
          const proposal = claw.user.review.edit(proposalId, patch, targetUserId);
          if (wantsJson) writeJson(context.stdout, proposal);
          else context.stdout.write(`edited ${proposal.id}\n`);
          return CLI_EXIT_OK;
        }
        if (action === "approve-many") {
          const ids = parseCsvFlag(flags.ids || joinedPositionals(positionals, 3));
          if (ids.length === 0) {
            context.stderr.write("Usage: claw user review approve-many <id,id> [--user ID]\n");
            return CLI_EXIT_USAGE;
          }
          const proposals = claw.user.review.approveMany(ids, targetUserId);
          if (wantsJson) writeJson(context.stdout, { proposals });
          else context.stdout.write(`${proposals.map((proposal) => `approved ${proposal.id}`).join("\n")}\n`);
          return CLI_EXIT_OK;
        }
        context.stderr.write("Usage: claw user review list|show|approve|reject|edit|approve-many [proposal-id]\n");
        return CLI_EXIT_USAGE;
      }

      if (command === "classify") {
        const text = subcommand || flags.text || joinedPositionals(positionals, 2);
        if (!text) {
          context.stderr.write("Usage: claw user classify <text>\n");
          return CLI_EXIT_USAGE;
        }
        const result = claw.user.classify(text);
        if (wantsJson) writeJson(context.stdout, result);
        else context.stdout.write(`${result.target} ${result.confidence} ${result.reason}\n`);
        return CLI_EXIT_OK;
      }

      if (command === "extract") {
        const action = subcommand;
        const source = flags.source || flags.text || joinedPositionals(positionals, 3);
        if (action !== "memory" || !source) {
          context.stderr.write("Usage: claw user extract memory --source TEXT [--user ID]\n");
          return CLI_EXIT_USAGE;
        }
        const proposals = claw.user.extractMemory({ userId: targetUserId, source });
        if (wantsJson) writeJson(context.stdout, { proposals });
        else context.stdout.write(`${proposals.map((proposal) => `proposed ${proposal.id}`).join("\n")}\n`);
        return CLI_EXIT_OK;
      }

      if (command === "merge") {
        const action = subcommand || "propose";
        if (action === "propose") {
          const proposals = claw.user.merge.propose({ userId: targetUserId, ...(flags.source || flags.from ? { sourceId: flags.source || flags.from } : {}), ...(flags.target || flags.to ? { targetId: flags.target || flags.to } : {}) });
          if (wantsJson) writeJson(context.stdout, { proposals });
          else context.stdout.write(`${proposals.map((proposal) => `merge ${proposal.id} ${proposal.sourceId} -> ${proposal.targetId}`).join("\n")}\n`);
          return CLI_EXIT_OK;
        }
        const mergeId = positionals[3] || flags.id;
        if (!mergeId || (action !== "approve" && action !== "reject")) {
          context.stderr.write("Usage: claw user merge propose|approve|reject [merge-id]\n");
          return CLI_EXIT_USAGE;
        }
        const proposal = action === "approve" ? claw.user.merge.approve(mergeId, targetUserId) : claw.user.merge.reject(mergeId, targetUserId);
        if (wantsJson) writeJson(context.stdout, proposal);
        else context.stdout.write(`${proposal.status} ${proposal.id}\n`);
        return CLI_EXIT_OK;
      }

      if (command === "set") {
        const factPath = subcommand || flags.path;
        const value = parseUserFactValue(flags.value ?? joinedPositionals(positionals, 3), "user value");
        if (!factPath) {
          context.stderr.write("Usage: claw user set <facet.key> <value> [--user ID]\n");
          return CLI_EXIT_USAGE;
        }
        const fact = claw.user.set({
          userId: targetUserId,
          path: factPath,
          value,
          ...metadata,
        });
        if (wantsJson) writeJson(context.stdout, fact);
        else context.stdout.write(`set ${factPath}\n`);
        return CLI_EXIT_OK;
      }

      if (command === "add") {
        const type = (subcommand || flags.type) as UserRecordType | undefined;
        const title = flags.title || joinedPositionals(positionals, 3);
        if (!type || !title) {
          context.stderr.write("Usage: claw user add <record-type> --title TEXT [--set key=value ...] [--user ID]\n");
          return CLI_EXIT_USAGE;
        }
        const record = claw.user.add({
          userId: targetUserId,
          type,
          title,
          fields: parseUserFieldsFromSetFlags(argv),
          ...metadata,
        });
        if (wantsJson) writeJson(context.stdout, record);
        else context.stdout.write(`added ${record.type} ${record.id}\n`);
        return CLI_EXIT_OK;
      }

      if (command === "supersede") {
        const id = subcommand || flags.id;
        if (!id) {
          context.stderr.write("Usage: claw user supersede <id> [--value VALUE|--title TEXT --set key=value]\n");
          return CLI_EXIT_USAGE;
        }
        const result = claw.user.supersede(id, {
          userId: targetUserId,
          ...(flags.value !== undefined ? { value: parseUserFactValue(flags.value, "replacement value") } : {}),
          ...(flags.title ? { title: flags.title } : {}),
          ...(argv.includes("--set") ? { fields: parseUserFieldsFromSetFlags(argv) } : {}),
          ...(flags.notes ? { notes: flags.notes } : {}),
          ...(flags["valid-from"] ? { validFrom: flags["valid-from"] } : {}),
          ...(flags.visibility ? { visibility: flags.visibility as "agent" | "public" | "private" } : {}),
        });
        if (wantsJson) writeJson(context.stdout, result);
        else context.stdout.write(`superseded ${id}\n`);
        return CLI_EXIT_OK;
      }

      if (command === "propose") {
        const proposalPath = subcommand || flags.path;
        const recordType = flags["record-type"] || flags.type;
        const value = flags.value !== undefined || positionals[3] !== undefined ? parseUserFactValue(flags.value ?? joinedPositionals(positionals, 3), "proposal value") : undefined;
        const proposal = claw.user.propose({
          userId: targetUserId,
          ...(proposalPath ? { path: proposalPath } : {}),
          ...(value !== undefined ? { value } : {}),
          ...(recordType ? { recordType: recordType as UserRecordType } : {}),
          ...(flags.title ? { title: flags.title } : {}),
          fields: parseUserFieldsFromSetFlags(argv),
          ...metadata,
        });
        if (wantsJson) writeJson(context.stdout, proposal);
        else context.stdout.write(`proposed ${proposal.id}\n`);
        return CLI_EXIT_OK;
      }

      if (command === "verify") {
        const proposalId = subcommand || flags.id;
        if (!proposalId) {
          context.stderr.write("Usage: claw user verify <proposal-id> [--user ID]\n");
          return CLI_EXIT_USAGE;
        }
        const proposal = claw.user.verify(proposalId, targetUserId);
        if (wantsJson) writeJson(context.stdout, proposal);
        else context.stdout.write(`verified ${proposal.id}\n`);
        return CLI_EXIT_OK;
      }

      if (command === "delete") {
        const id = subcommand || flags.id;
        if (!id) {
          context.stderr.write("Usage: claw user delete <id> [--user ID]\n");
          return CLI_EXIT_USAGE;
        }
        const result = claw.user.delete(id, targetUserId);
        if (wantsJson) writeJson(context.stdout, result);
        else context.stdout.write(`${result.deleted ? "deleted" : "not found"} ${result.id}\n`);
        return result.deleted ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
      }

      if (command === "validate") {
        const spec = claw.user.resolve({ userId: subcommand || targetUserId, agentId: flags.agent ? targetAgentId : undefined });
        const result = claw.user.validate(spec);
        if (wantsJson) writeJson(context.stdout, result);
        else context.stdout.write(result.ok ? "valid\n" : `${result.issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n")}\n`);
        return result.ok ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
      }

      if (command === "preview") {
        const result = claw.user.preview({
          userId: subcommand || targetUserId,
          agentId: targetAgentId,
          ...(flags.profile ? { profile: flags.profile as UserCompileProfile } : {}),
        });
        if (wantsJson) writeJson(context.stdout, result);
        else context.stdout.write(result.markdown);
        return CLI_EXIT_OK;
      }

      if (command === "compile") {
        const result = claw.user.compile({
          userId: subcommand || targetUserId,
          agentId: targetAgentId,
          ...(flags.profile ? { profile: flags.profile as UserCompileProfile } : {}),
        });
        if (wantsJson) writeJson(context.stdout, result);
        else context.stdout.write(`compiled ${result.userId} to ${result.targetFile}\n`);
        return CLI_EXIT_OK;
      }

      if (command === "assign") {
        const userId = subcommand || targetUserId;
        if (!userId || !targetAgentId) {
          context.stderr.write("Usage: claw user assign <user-id> --agent ID [--compile]\n");
          return CLI_EXIT_USAGE;
        }
        const assignment = claw.user.assign({ userId, agentId: targetAgentId });
        const compiled = readBooleanFlag(argv, flags, "compile", false)
          ? claw.user.compile({ agentId: targetAgentId })
          : null;
        if (wantsJson) writeJson(context.stdout, { assignment, compiled });
        else context.stdout.write(`assigned ${assignment.userId} to ${assignment.agentId}\n`);
        return CLI_EXIT_OK;
      }
    } catch (error) {
      const handled = cliErrorFromUnknown(error);
      if (wantsJson) writeCliError(context.stdout, handled);
      else context.stderr.write(`${handled.message}\n`);
      return handled.exitCode;
    }

    context.stderr.write("Usage: claw user init|set|add|propose|verify|review|domains|pack|wizard|entity|link|query|delete|list|get|inspect|validate|preview|compile|assign\n");
    return CLI_EXIT_USAGE;
  }

  if (group === "rules") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, argv);
    const scopeId = flags.scope || flags["scope-id"];

    try {
      if (command === "status") {
        const status = claw.rules.status();
        if (wantsJson) writeJson(context.stdout, status);
        else context.stdout.write(`rules ${status.rules} active ${status.active} pending ${status.pending}\n`);
        return CLI_EXIT_OK;
      }

      if (command === "list") {
        const rules = claw.rules.list({
          ...(flags.status ? { status: flags.status as "pending" | "active" | "archived" } : {}),
          ...(scopeId ? { scopeId } : {}),
        });
        if (wantsJson) writeJson(context.stdout, { rules });
        else context.stdout.write(`${rules.map((rule) => `${rule.status} ${rule.kind} ${rule.id} ${rule.title}`).join("\n")}\n`);
        return CLI_EXIT_OK;
      }

      if (command === "get" || command === "inspect") {
        const id = subcommand || flags.id;
        const rule = id ? claw.rules.get(id) : null;
        if (!rule) throw new CliHandledError("not_found", `Rule not found: ${id ?? ""}`, CLI_EXIT_FAILURE);
        if (wantsJson) writeJson(context.stdout, rule);
        else context.stdout.write(`${rule.status} ${rule.kind} ${rule.id}\n${rule.content}\n`);
        return CLI_EXIT_OK;
      }

      if (command === "scopes") {
        if (flags.name || flags.kind || flags.id) {
          if (!flags.name || !flags.kind) {
            context.stderr.write("Usage: claw rules scopes --id ID --kind KIND --name TEXT [--parent ID] [--aliases a,b]\n");
            return CLI_EXIT_USAGE;
          }
          const scope = claw.rules.upsertScope({
            id: flags.id,
            kind: flags.kind,
            name: flags.name,
            parentId: flags.parent,
            aliases: parseCsvFlag(flags.aliases),
          });
          if (wantsJson) writeJson(context.stdout, scope);
          else context.stdout.write(`scope ${scope.id}\n`);
          return CLI_EXIT_OK;
        }
        const scopes = claw.rules.scopes();
        if (wantsJson) writeJson(context.stdout, { scopes });
        else context.stdout.write(`${scopes.map((scope) => `${scope.kind} ${scope.id} ${scope.name}`).join("\n")}\n`);
        return CLI_EXIT_OK;
      }

      if (command === "propose") {
        if (!scopeId || !flags.title || !flags.content) {
          context.stderr.write("Usage: claw rules propose --scope ID --title TEXT --content TEXT [--kind directive|default|resource]\n");
          return CLI_EXIT_USAGE;
        }
        const rule = claw.rules.propose({
          id: flags.id,
          title: flags.title,
          kind: (flags.kind as "directive" | "default" | "resource" | undefined) ?? "directive",
          status: (flags.status as "pending" | "active" | "archived" | undefined) ?? "pending",
          scopeId,
          content: flags.content,
          aliases: parseCsvFlag(flags.aliases),
          priority: flags.priority ? Number(flags.priority) : undefined,
          key: flags.key,
          references: parseRuleReferences(flags.reference || flags.references),
          agentIds: parseCsvFlag(flags.agent || flags.agents),
          channelIds: parseCsvFlag(flags.channel || flags.channels),
          applyWhen: {
            keywords: parseCsvFlag(flags.keywords),
            taskTypes: parseCsvFlag(flags["task-types"] || flags.task),
            outputFormats: parseCsvFlag(flags["output-formats"] || flags.output),
            domains: parseCsvFlag(flags.domains || flags.domain),
            services: parseCsvFlag(flags.services || flags.service),
            projects: parseCsvFlag(flags.projects || flags.project),
            agents: parseCsvFlag(flags.agents),
            channels: parseCsvFlag(flags.channels),
          },
          source: flags.source,
        });
        if (wantsJson) writeJson(context.stdout, rule);
        else context.stdout.write(`proposed ${rule.id}\n`);
        return CLI_EXIT_OK;
      }

      if (command === "approve" || command === "archive") {
        const id = subcommand || flags.id;
        if (!id) {
          context.stderr.write(`Usage: claw rules ${command} <id>\n`);
          return CLI_EXIT_USAGE;
        }
        const rule = command === "approve" ? claw.rules.approve(id) : claw.rules.archive(id);
        if (wantsJson) writeJson(context.stdout, rule);
        else context.stdout.write(`${rule.status} ${rule.id}\n`);
        return CLI_EXIT_OK;
      }

      if (command === "compile") {
        const prompt = subcommand || flags.prompt || flags.text || "";
        if (!prompt.trim()) {
          context.stderr.write("Usage: claw rules compile <prompt> [--brand BRAND] [--output-format website] [--json]\n");
          return CLI_EXIT_USAGE;
        }
        const result = claw.rules.compile({
          prompt,
          user: flags.user,
          organization: flags.organization || flags.org,
          brand: flags.brand,
          client: flags.client,
          project: flags.project,
          domain: flags.domain,
          service: flags.service,
          taskType: flags["task-type"] || flags.task,
          outputFormat: flags["output-format"] || flags.output,
          agent: flags.agent,
          channel: flags.channel,
          ...(flags.limit ? { limit: Number(flags.limit) } : {}),
        });
        if (wantsJson) writeJson(context.stdout, result);
        else context.stdout.write(result.prompt ? `${result.prompt}\n` : "No applicable rules.\n");
        return CLI_EXIT_OK;
      }
    } catch (error) {
      const handled = cliErrorFromUnknown(error);
      if (wantsJson) writeCliError(context.stdout, handled);
      else context.stderr.write(`${handled.message}\n`);
      return handled.exitCode;
    }

    context.stderr.write("Usage: claw rules status|list|get|propose|approve|archive|scopes|compile\n");
    return CLI_EXIT_USAGE;
  }

  if (group === "library") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const targetAgentId = flags.agent || agentId;
    const targetWorkspaceId = flags.workspaceId || flags["workspace-id"] || workspaceId;
    const tags = parseCsvFlag(flags.tags);
    const requiredSecrets = parseCsvFlag(flags["required-secret"] || flags["required-secrets"]).map((name) => ({ name }));
    const availableSecrets = parseCsvFlag(flags.secret || flags.secrets);

    try {
      if (command === "list") {
        const assets = claw.library.list();
        if (wantsJson) writeJson(context.stdout, { assets });
        else context.stdout.write(`${assets.map((asset) => `${asset.kind} ${asset.id} ${asset.title}`).join("\n")}\n`);
        return CLI_EXIT_OK;
      }

      if (command === "inspect") {
        const asset = subcommand ? claw.library.get(subcommand) : null;
        if (!asset) throw new CliHandledError("not_found", `Library asset not found: ${subcommand ?? ""}`, CLI_EXIT_FAILURE);
        if (wantsJson) writeJson(context.stdout, asset);
        else context.stdout.write(`${asset.kind} ${asset.id}\n${asset.title}\n`);
        return CLI_EXIT_OK;
      }

      if (command === "create") {
        const id = subcommand || flags.id;
        const kind = flags.kind as "skill" | "instruction" | "bundle" | undefined;
        if (!kind || !["skill", "instruction", "bundle"].includes(kind)) {
          context.stderr.write("Usage: claw library create <id> --kind skill|instruction|bundle [--title TEXT] [--content TEXT] [--projection agents|soul|identity|tools] [--ref REF] [--assets a,b]\n");
          return CLI_EXIT_USAGE;
        }
        const asset = claw.library.create({
          ...(id ? { id } : {}),
          kind,
          title: flags.title,
          description: flags.description,
          tags,
          version: flags.version,
          requiredSecrets,
          autoApplyTags: parseCsvFlag(flags["auto-apply-tags"]),
          ...(flags["context-capsule"] ? {
            context: {
              capsule: flags["context-capsule"],
              priority: flags["context-priority"] ? Number(flags["context-priority"]) : 100,
              ...(flags["context-read-when"] ? { readWhen: parseCsvFlag(flags["context-read-when"]) } : {}),
            },
          } : {}),
          ...(kind === "skill" ? { source: { source: flags.source, installRef: flags.ref, path: flags.path } } : {}),
          ...(kind === "instruction" ? {
            content: flags.content ?? "",
            projection: {
              target: (flags.projection || "agents") as "soul" | "identity" | "agents" | "tools" | "heartbeat" | "user",
              ...(flags["block-id"] ? { blockId: flags["block-id"] } : {}),
            },
          } : {}),
          ...(kind === "bundle" ? { bundleAssetIds: parseCsvFlag(flags.assets) } : {}),
        });
        if (wantsJson) writeJson(context.stdout, asset);
        else context.stdout.write(`created ${asset.kind} ${asset.id}\n`);
        return CLI_EXIT_OK;
      }

      if (command === "update") {
        const id = subcommand || flags.id;
        if (!id) {
          context.stderr.write("Usage: claw library update <id> [--title TEXT] [--content TEXT] [--tags a,b]\n");
          return CLI_EXIT_USAGE;
        }
        const asset = claw.library.update(id, {
          ...(flags.title !== undefined ? { title: flags.title } : {}),
          ...(flags.description !== undefined ? { description: flags.description } : {}),
          ...(flags.tags !== undefined ? { tags } : {}),
          ...(flags.version !== undefined ? { version: flags.version } : {}),
          ...(flags["context-capsule"] !== undefined ? {
            context: {
              capsule: flags["context-capsule"],
              priority: flags["context-priority"] ? Number(flags["context-priority"]) : 100,
              ...(flags["context-read-when"] ? { readWhen: parseCsvFlag(flags["context-read-when"]) } : {}),
            },
          } : {}),
          ...(flags.content !== undefined ? { content: flags.content } : {}),
          ...(flags["required-secret"] !== undefined || flags["required-secrets"] !== undefined ? { requiredSecrets } : {}),
          ...(flags["auto-apply-tags"] !== undefined ? { autoApplyTags: parseCsvFlag(flags["auto-apply-tags"]) } : {}),
          ...(flags.assets !== undefined ? { bundleAssetIds: parseCsvFlag(flags.assets) } : {}),
        });
        if (wantsJson) writeJson(context.stdout, asset);
        else context.stdout.write(`updated ${asset.kind} ${asset.id}\n`);
        return CLI_EXIT_OK;
      }

      if (command === "remove") {
        const id = subcommand || flags.id;
        if (!id) {
          context.stderr.write("Usage: claw library remove <id>\n");
          return CLI_EXIT_USAGE;
        }
        const removed = claw.library.remove(id);
        if (wantsJson) writeJson(context.stdout, { removed });
        else context.stdout.write(`${removed ? "removed" : "not found"} ${id}\n`);
        return removed ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
      }

      if (command === "import-skill") {
        const ref = subcommand || flags.ref || "";
        const asset = claw.library.importSkill(ref, {
          id: flags.id,
          title: flags.title,
          source: flags.source,
          path: flags.path,
          tags,
          ...(flags["context-capsule"] ? {
            context: {
              capsule: flags["context-capsule"],
              priority: flags["context-priority"] ? Number(flags["context-priority"]) : 100,
              ...(flags["context-read-when"] ? { readWhen: parseCsvFlag(flags["context-read-when"]) } : {}),
            },
          } : {}),
        });
        if (wantsJson) writeJson(context.stdout, asset);
        else context.stdout.write(`imported skill ${asset.id}\n`);
        return CLI_EXIT_OK;
      }

      if (command === "assign" || command === "unassign") {
        const assetId = subcommand || flags.id;
        const assignmentWorkspaceId = flags["target-workspace"];
        const targetId = flags.agent || assignmentWorkspaceId || "";
        if (!assetId || !targetId) {
          context.stderr.write(`Usage: claw library ${command} <asset> --agent ID|--target-workspace ID [--exclude]\n`);
          return CLI_EXIT_USAGE;
        }
        const payload = {
          assetId,
          scope: assignmentWorkspaceId ? "workspace" as const : "agent" as const,
          targetId,
          mode: readBooleanFlag(argv, flags, "exclude", false) ? "exclude" as const : "include" as const,
        };
        const result = command === "assign" ? claw.library.assign(payload) : claw.library.unassign(payload);
        if (wantsJson) writeJson(context.stdout, result);
        else context.stdout.write(`${command === "assign" ? "assigned" : "unassigned"} ${assetId}\n`);
        return CLI_EXIT_OK;
      }

      if (command === "resolve" || command === "sync") {
        const input = {
          agentId: targetAgentId,
          workspaceId: targetWorkspaceId,
          tags,
          availableSecrets,
          ...(readBooleanFlag(argv, flags, "allow-missing-secrets", false) ? { allowMissingSecrets: true } : {}),
        };
        if (command === "sync") {
          const result = await claw.library.sync(input);
          if (wantsJson) writeJson(context.stdout, result);
          else context.stdout.write(`synced ${result.resolved.assets.length} library assets\n`);
        } else {
          const result = claw.library.resolve(input);
          if (wantsJson) writeJson(context.stdout, result);
          else context.stdout.write(`${result.assets.map((asset) => `${asset.kind} ${asset.id}`).join("\n")}\n`);
        }
        return CLI_EXIT_OK;
      }
    } catch (error) {
      const handled = cliErrorFromUnknown(error);
      if (wantsJson) writeCliError(context.stdout, handled);
      else context.stderr.write(`${handled.message}\n`);
      return handled.exitCode;
    }

    context.stderr.write("Usage: claw library list|inspect|create|update|remove|import-skill|assign|unassign|resolve|sync\n");
    return CLI_EXIT_USAGE;
  }

  if (group === "skills" && command === "list") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    if (readBooleanFlag(argv, flags, "legacy", false)) {
      const skills = await claw.skills.list();
      if (wantsJson) writeJson(context.stdout, skills);
      else context.stdout.write(`${skills.map((entry) => `${entry.enabled ? "*" : "-"} ${entry.id}`).join("\n")}\n`);
      return skills.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
    const filter: { kinds?: ("personality" | "procedure" | "snippet" | "role")[]; scope?: "global" | "project" | "tag" | "chat"; tags?: string[]; builtin?: boolean } = {};
    if (flags.kind) filter.kinds = [flags.kind as "personality" | "procedure" | "snippet" | "role"];
    if (flags.scope) filter.scope = flags.scope as "global" | "project" | "tag" | "chat";
    if (flags.tag) filter.tags = String(flags.tag).split(",").map((t) => t.trim()).filter(Boolean);
    const skills = claw.skills.listV2(filter);
    if (wantsJson) writeJson(context.stdout, skills);
    else context.stdout.write(`${skills.map((entry) => `${entry.kind}\t${entry.slug}\t${entry.name}`).join("\n")}\n`);
    return skills.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "skills" && (command === "view" || command === "show") && subcommand) {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const spec = claw.skills.get(subcommand);
    if (!spec) {
      context.stderr.write(`Skill not found: ${subcommand}\n`);
      return CLI_EXIT_FAILURE;
    }
    if (wantsJson) writeJson(context.stdout, spec);
    else context.stdout.write(`${spec.kind} ${spec.slug}\n${spec.name}\n${spec.description}\n\n${spec.body}\n`);
    return CLI_EXIT_OK;
  }

  if (group === "skills" && command === "create" && subcommand) {
    const slug = subcommand;
    const kind = (flags.kind || "procedure") as "personality" | "procedure" | "snippet" | "role";
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    let body = flags.body || flags.content;
    if (!body && readBooleanFlag(argv, flags, "from-stdin", false)) {
      body = await readAllStdin(process.stdin);
    }
    const tags = flags.tags ? flags.tags.split(",").map((t) => t.trim()).filter(Boolean) : undefined;
    const syncTo = flags["sync-to"] ? flags["sync-to"].split(",").map((t) => t.trim()).filter(Boolean) : undefined;
    const spec = claw.skills.create({
      slug,
      kind,
      name: flags.name,
      description: flags.description,
      body,
      tags,
      syncTo,
    });
    if (wantsJson) writeJson(context.stdout, spec);
    else context.stdout.write(`created ${spec.kind}/${spec.slug}\n`);
    return CLI_EXIT_OK;
  }

  if (group === "skills" && command === "remove" && subcommand) {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const ok = claw.skills.removeV2(subcommand);
    if (wantsJson) writeJson(context.stdout, { removed: ok });
    else context.stdout.write(ok ? `removed ${subcommand}\n` : `not found: ${subcommand}\n`);
    return ok ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
  }

  if (group === "skills" && command === "activate" && subcommand) {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const scope = parseSkillScopeFlag(flags.scope || "global");
    const assignment = claw.skills.activate(subcommand, scope);
    if (wantsJson) writeJson(context.stdout, assignment);
    else context.stdout.write(`activated ${subcommand} scope=${scope.kind}\n`);
    return CLI_EXIT_OK;
  }

  if (group === "skills" && command === "deactivate" && subcommand) {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const scope = parseSkillScopeFlag(flags.scope || "global");
    const removed = claw.skills.deactivate(subcommand, scope);
    if (wantsJson) writeJson(context.stdout, { removed });
    else context.stdout.write(removed ? `deactivated ${subcommand}\n` : `not active: ${subcommand}\n`);
    return removed ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
  }

  if (group === "skills" && command === "compile") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const slugs = (flags.slugs ? flags.slugs.split(",") : positionals.slice(2)).map((s) => s.trim()).filter(Boolean);
    const slugList = slugs.length > 0 ? slugs : claw.skills.resolveActive({ projectId: flags.project, chatId: flags.chat }).map((s) => s.slug);
    const text = claw.skills.compile(slugList);
    if (wantsJson) writeJson(context.stdout, { slugs: slugList, prompt: text });
    else context.stdout.write(`${text}\n`);
    return CLI_EXIT_OK;
  }

  if (group === "skills" && command === "instantiate" && subcommand) {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const params = parseSkillParamsFlag(flags.params);
    const spec = claw.skills.instantiate(subcommand, params, {
      saveAs: flags["save-as"],
      freeze: readBooleanFlag(argv, flags, "freeze", false),
    });
    if (wantsJson) writeJson(context.stdout, spec);
    else context.stdout.write(`instantiated ${spec.slug} (template=${subcommand})\n`);
    return CLI_EXIT_OK;
  }

  if (group === "skills" && command === "freeze" && subcommand) {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const spec = claw.skills.freeze(subcommand);
    if (wantsJson) writeJson(context.stdout, spec);
    else context.stdout.write(`frozen ${spec.slug}\n`);
    return CLI_EXIT_OK;
  }

  if (group === "skills" && (command === "init-builtins" || command === "init")) {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const report = claw.skills.initBuiltins();
    if (wantsJson) writeJson(context.stdout, report);
    else context.stdout.write(`personalities=${report.personalitiesCreated} procedures=${report.proceduresCreated} skipped=${report.skipped}\n`);
    return CLI_EXIT_OK;
  }

  if (group === "init-skills-builtins") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const report = claw.skills.initBuiltins();
    if (wantsJson) writeJson(context.stdout, report);
    else context.stdout.write(`personalities=${report.personalitiesCreated} procedures=${report.proceduresCreated} skipped=${report.skipped}\n`);
    return CLI_EXIT_OK;
  }

  if (group === "skills" && command === "import") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const dirs = flags.from ? [flags.from] : flags.dirs ? flags.dirs.split(",").map((d) => d.trim()).filter(Boolean) : undefined;
    const report = await claw.skills.importExternal({ dirs });
    if (wantsJson) writeJson(context.stdout, report);
    else context.stdout.write(`imported=${report.imported.length} skipped=${report.skipped.length} warnings=${report.warnings.length}\n`);
    return CLI_EXIT_OK;
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
    if (command === "sync" && !readBooleanFlag(argv, flags, "legacy", false)) {
      const targets = flags.target && flags.target !== "all" ? flags.target.split(",").map((t) => t.trim()).filter(Boolean) : undefined;
      const report = await claw.skills.syncV2({ targets });
      if (wantsJson) writeJson(context.stdout, report);
      else context.stdout.write(`synced=${report.synced.length} removed=${report.removed.length} warnings=${report.warnings.length}\n`);
      return CLI_EXIT_OK;
    }
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

  if (group === "agents" && command === "codex") {
    const codexCommand = subcommand || "status";
    const codexRuntimeAdapterId = resolveCodexRuntimeAdapterId(flags);
    const claw = await createCliClaw(codexRuntimeAdapterId, flags, workspaceRoot, appId, workspaceId, CODEX_AGENT_ID, argv);
    if (codexCommand === "setup") {
      const processor = registerCodexAgentProcessor({ claw, workspaceRoot, runtimeAdapterId: codexRuntimeAdapterId, flags });
      const status = await claw.runtime.status();
      const payload = { agentId: CODEX_AGENT_ID, runtime: codexRuntimeAdapterId, processor, status };
      if (wantsJson) writeJson(context.stdout, payload);
      else context.stdout.write(`codex setup processor=${processor.id} runtime=${codexRuntimeAdapterId}\n`);
      return CLI_EXIT_OK;
    }
    if (codexCommand === "status") {
      const processor = claw.channels.processors.get(CODEX_AGENT_ID);
      const status = await claw.runtime.status();
      const payload = { agentId: CODEX_AGENT_ID, runtime: codexRuntimeAdapterId, processorRegistered: !!processor, processor, status };
      if (wantsJson) writeJson(context.stdout, payload);
      else context.stdout.write(`agent=codex runtime=${codexRuntimeAdapterId} processor=${processor ? "registered" : "missing"}\n`);
      return CLI_EXIT_OK;
    }
    if (codexCommand === "models") {
      const models = await claw.models.list();
      if (wantsJson) writeJson(context.stdout, models);
      else context.stdout.write(`${models.map((model) => `${model.isDefault ? "*" : "-"} ${model.id}`).join("\n")}\n`);
      return CLI_EXIT_OK;
    }
    if (codexCommand === "auth" && positionals[3] === "status") {
      const auth = await claw.auth.status();
      if (wantsJson) writeJson(context.stdout, auth);
      else context.stdout.write(`${Object.entries(auth).map(([provider, summary]) => `${provider}:${summary.hasAuth ? "authenticated" : "missing"}`).join("\n")}\n`);
      return CLI_EXIT_OK;
    }
    context.stderr.write(`Usage: ${binName} agents codex setup|status|models|auth status\n`);
    return CLI_EXIT_USAGE;
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

  if (group === "channels" && command === "telegram" && subcommand === "setup") {
    const account = normalizeTelegramCodexAccount(flags);
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, argv);
    let accountRecord = claw.channels.accounts.get("telegram", account);
    if (flags["secret-name"] || flags.secret) {
      const secretName = flags["secret-name"] || flags.secret;
      const secret = await claw.telegram.provisionSecretReference({
        secretName,
        apiBaseUrl: flags["api-base-url"],
      });
      if (secret.status !== "configured") {
        if (wantsJson) writeJson(context.stdout, secret);
        else context.stderr.write(`${secret.instructions.summary}\n`);
        return CLI_EXIT_DEGRADED;
      }
      accountRecord = await claw.channels.accounts.registerTelegramBot({
        accountId: account,
        label: flags.name,
        secretName,
        apiBaseUrl: flags["api-base-url"],
        webhookUrl: flags["webhook-url"],
        webhookSecretToken: flags["webhook-secret-token"],
        allowedUpdates: parseJsonFlag<string[]>(flags["allowed-updates"], "--allowed-updates"),
        ...(flags["drop-pending-updates"] !== undefined ? { dropPendingUpdates: readBooleanFlag(argv, flags, "drop-pending-updates", false) } : {}),
      });
    }
    if (!accountRecord) {
      context.stderr.write("Telegram account is not configured. Pass --secret-name to set it up.\n");
      return CLI_EXIT_DEGRADED;
    }
    if (wantsJson) writeJson(context.stdout, accountRecord);
    else context.stdout.write(`${accountRecord.id} ${accountRecord.status}\n`);
    return CLI_EXIT_OK;
  }

  if (group === "channels" && (command === "assign" || command === "unassign")) {
    const provider = flags.channel || flags.provider || "telegram";
    const account = flags.account;
    const assignedAgent = flags.agent || flags["agent-id"];
    if (!assignedAgent) {
      context.stderr.write("--agent is required\n");
      return CLI_EXIT_USAGE;
    }
    const targetId = flags["target-id"] || flags.target || flags["chat-id"];
    const assignmentRuntimeAdapterId = assignedAgent === CODEX_AGENT_ID ? resolveCodexRuntimeAdapterId(flags) : runtimeAdapterId;
    const claw = await createCliClaw(assignmentRuntimeAdapterId, flags, workspaceRoot, appId, workspaceId, assignedAgent, argv);
    if (command === "assign") {
      let processorId = assignedAgent;
      if (assignedAgent === CODEX_AGENT_ID) {
        registerCodexAgentProcessor({ claw, workspaceRoot, runtimeAdapterId: assignmentRuntimeAdapterId, flags });
      } else if (flags.processor) {
        processorId = flags.processor;
      }
      const binding = claw.channels.bindings.grant({
        agentId: assignedAgent,
        provider,
        accountId: account,
        targetId,
        permissions: ["read", "write", "ingest"],
        priority: flags.priority ? Number(flags.priority) : 100,
        metadata: {
          assignmentType: "channel-agent",
          processorId,
          agentKind: assignedAgent,
        },
      });
      let commands: unknown = null;
      if (provider === "telegram" && assignedAgent === CODEX_AGENT_ID && claw.channels.accounts.get("telegram", account)) {
        commands = await claw.channels.commands.set("telegram", TELEGRAM_CODEX_BOT_COMMANDS, { accountId: account });
      }
      const payload = { assignment: binding, commands };
      if (wantsJson) writeJson(context.stdout, payload);
      else context.stdout.write(`assigned ${provider}:${account || "default"} -> ${assignedAgent}\n`);
      return CLI_EXIT_OK;
    }
    const bindings = claw.channels.bindings.list({ agentId: assignedAgent, provider, accountId: account, ...(targetId ? { targetId } : {}) });
    const matching = bindings.filter((binding) => binding.metadata?.assignmentType === "channel-agent");
    for (const binding of matching) {
      claw.channels.bindings.revoke(binding.id);
    }
    if (wantsJson) writeJson(context.stdout, { removed: matching.length });
    else context.stdout.write(`unassigned ${matching.length}\n`);
    return CLI_EXIT_OK;
  }

  if (group === "channels" && command === "assignments") {
    const assignmentsCommand = subcommand || "list";
    const provider = flags.channel || flags.provider;
    const account = flags.account;
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, argv);
    const assignments = claw.channels.bindings.list({ provider, accountId: account, agentId: flags.agent })
      .filter((binding) => binding.metadata?.assignmentType === "channel-agent")
      .map((binding) => {
        const processorId = typeof binding.metadata?.processorId === "string" ? binding.metadata.processorId : binding.agentId;
        const processor = claw.channels.processors.get(processorId);
        const listener = binding.provider ? claw.channels.listeners.get(binding.provider, binding.accountId) : null;
        const pid = listener?.pid;
        const running = isProcessRunning(pid);
        return {
          ...binding,
          processorId,
          processorRegistered: !!processor,
          listenerStatus: running ? "running" : listener?.status ?? "stopped",
          pid,
        };
      });
    if (assignmentsCommand === "list" || assignmentsCommand === "status") {
      if (wantsJson) writeJson(context.stdout, assignments);
      else context.stdout.write(`${assignments.map((entry) => `${entry.provider ?? "*"}:${entry.accountId ?? "*"} -> ${entry.agentId} ${assignmentsCommand === "status" ? entry.listenerStatus : ""}`.trim()).join("\n")}\n`);
      return assignments.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
    context.stderr.write(`Usage: ${binName} channels assignments list|status\n`);
    return CLI_EXIT_USAGE;
  }

  if (group === "channels" && command === "telegram" && subcommand === "codex") {
    const codexCommand = positionals[3] || "status";
    const codexSubcommand = positionals[4];
    const account = normalizeTelegramCodexAccount(flags);
    const listenerOptions = resolveTelegramCodexListenerOptions(flags);
    const provider = "telegram";
    const codexRuntimeAdapterId = resolveCodexRuntimeAdapterId(flags);

    const registerProcessor = (claw: Awaited<ReturnType<typeof createCliClaw>>) => {
      const processor = registerCodexAgentProcessor({ claw, workspaceRoot, runtimeAdapterId: codexRuntimeAdapterId, flags });
      registerCodexAgentProcessor({ claw, workspaceRoot, runtimeAdapterId: codexRuntimeAdapterId, flags, id: LEGACY_TELEGRAM_CODEX_PROCESSOR_ID });
      return processor;
    };

    const assignCodex = (claw: Awaited<ReturnType<typeof createCliClaw>>) => claw.channels.bindings.grant({
      agentId: CODEX_AGENT_ID,
      provider,
      accountId: account,
      permissions: ["read", "write", "ingest"],
      priority: 100,
      metadata: {
        assignmentType: "channel-agent",
        processorId: CODEX_AGENT_ID,
        agentKind: "codex",
      },
    });

    const syncCommands = async (claw: Awaited<ReturnType<typeof createCliClaw>>) => {
      const accountRecord = claw.channels.accounts.get(provider, account);
      if (!accountRecord) return null;
      return await claw.channels.commands.set(provider, TELEGRAM_CODEX_BOT_COMMANDS, { accountId: account });
    };

    const stopListener = async (claw: Awaited<ReturnType<typeof createCliClaw>>) => {
      const paths = channelListenerPaths(workspaceRoot, provider, account);
      fs.mkdirSync(paths.runDir, { recursive: true });
      fs.writeFileSync(paths.stopPath, `${Date.now()}\n`);
      const pid = readListenerPid(paths.pidPath) ?? claw.channels.listeners.get(provider, account)?.pid;
      const startedAt = Date.now();
      while (pid && isProcessRunning(pid) && Date.now() - startedAt < 5_000) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (pid && isProcessRunning(pid)) {
        try {
          process.kill(pid, "SIGTERM");
        } catch {
          // already stopped
        }
      }
      return claw.channels.listeners.upsert({
        provider,
        accountId: account,
        processorId: CODEX_AGENT_ID,
        mode: "background",
        status: "stopped",
        pid,
        pidPath: paths.pidPath,
        stopPath: paths.stopPath,
        logPath: paths.logPath,
        stoppedAt: new Date().toISOString(),
      });
    };

    const startListener = async (claw: Awaited<ReturnType<typeof createCliClaw>>, options: { restart?: boolean } = {}) => {
      registerProcessor(claw);
      assignCodex(claw);
      await syncCommands(claw);
      if (options.restart) {
        await stopListener(claw);
      }
      const paths = channelListenerPaths(workspaceRoot, provider, account);
      const current = claw.channels.listeners.get(provider, account);
      const currentPid = current?.pid ?? readListenerPid(paths.pidPath);
      if (!options.restart && isProcessRunning(currentPid)) {
        return claw.channels.listeners.upsert({
          ...(current ?? {
            provider,
            accountId: account,
            processorId: CODEX_AGENT_ID,
            mode: "background" as const,
            startedAt: new Date().toISOString(),
          }),
          provider,
          accountId: account,
          processorId: CODEX_AGENT_ID,
          status: "running",
          pid: currentPid,
          pidPath: paths.pidPath,
          stopPath: paths.stopPath,
          logPath: paths.logPath,
          lastHeartbeatAt: new Date().toISOString(),
        });
      }
      fs.mkdirSync(paths.runDir, { recursive: true });
      fs.rmSync(paths.stopPath, { force: true });
      if (readBooleanFlag(argv, flags, "foreground", false)) {
        return await claw.channels.listen.run({
          provider,
          accountId: account,
          processorId: CODEX_AGENT_ID,
          intervalMs: listenerOptions.intervalMs,
          timeoutSeconds: listenerOptions.timeoutSeconds,
          processorTimeoutMs: listenerOptions.processorTimeoutMs,
          pidPath: paths.pidPath,
          stopPath: paths.stopPath,
          logPath: paths.logPath,
          mode: "foreground",
        });
      }
      const args = [
        currentCliEntryPath(),
        "channels",
        "listen",
        "run",
        "--provider",
        provider,
        "--workspace",
        workspaceRoot,
        "--runtime",
        codexRuntimeAdapterId,
        "--background",
        "--interval-ms",
        String(listenerOptions.intervalMs),
        "--timeout",
        String(listenerOptions.timeoutSeconds),
        "--processor-timeout-ms",
        String(listenerOptions.processorTimeoutMs),
      ];
      if (account) args.push("--account", account);
      const logFd = fs.openSync(paths.logPath, "a");
      const child = spawn(process.execPath, args, {
        cwd: context.cwd,
        env: process.env,
        detached: true,
        stdio: ["ignore", logFd, logFd],
      });
      fs.closeSync(logFd);
      child.unref();
      const pid = await waitForListenerPid(paths.pidPath);
      return claw.channels.listeners.upsert({
        provider,
        accountId: account,
        processorId: CODEX_AGENT_ID,
        mode: "background",
        status: pid ? "running" : "stale",
        pid: pid ?? child.pid,
        pidPath: paths.pidPath,
        stopPath: paths.stopPath,
        logPath: paths.logPath,
        startedAt: new Date().toISOString(),
        lastHeartbeatAt: new Date().toISOString(),
      });
    };

    const readStatus = async (claw: Awaited<ReturnType<typeof createCliClaw>>) => {
      const paths = channelListenerPaths(workspaceRoot, provider, account);
      const listener = claw.channels.listeners.get(provider, account);
      const pid = listener?.pid ?? readListenerPid(paths.pidPath);
      const running = isProcessRunning(pid);
      const processor = claw.channels.processors.get(CODEX_AGENT_ID) ?? claw.channels.processors.get(LEGACY_TELEGRAM_CODEX_PROCESSOR_ID);
      let commands: Array<{ command: string; description: string }> | null = null;
      try {
        commands = await claw.channels.commands.get(provider, { accountId: account });
      } catch {
        commands = null;
      }
      const commandsSynced = !!commands && TELEGRAM_CODEX_BOT_COMMANDS.every((expected) => (
        commands?.some((actual) => actual.command === expected.command && actual.description === expected.description)
      ));
      return {
        provider,
        accountId: account ?? "default",
        processorId: CODEX_AGENT_ID,
        processorRegistered: !!processor,
        listenerStatus: running ? "running" : listener?.status ?? "stopped",
        pid,
        commandsSynced,
        commandCount: commands?.length ?? 0,
        lastError: listener?.lastError,
        logPath: paths.logPath,
      };
    };

    if (codexCommand === "setup") {
      const claw = await createCliClaw(codexRuntimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, argv);
      let accountRecord = claw.channels.accounts.get(provider, account);
      if (flags["secret-name"] || flags.secret) {
        const secretName = flags["secret-name"] || flags.secret;
        const secret = await claw.telegram.provisionSecretReference({
          secretName,
          apiBaseUrl: flags["api-base-url"],
        });
        if (secret.status !== "configured") {
          if (wantsJson) writeJson(context.stdout, secret);
          else context.stderr.write(`${secret.instructions.summary}\n`);
          return CLI_EXIT_DEGRADED;
        }
        accountRecord = await claw.channels.accounts.registerTelegramBot({
          accountId: account,
          label: flags.name,
          secretName,
          apiBaseUrl: flags["api-base-url"],
          webhookUrl: flags["webhook-url"],
          webhookSecretToken: flags["webhook-secret-token"],
          allowedUpdates: parseJsonFlag<string[]>(flags["allowed-updates"], "--allowed-updates"),
          ...(flags["drop-pending-updates"] !== undefined ? { dropPendingUpdates: readBooleanFlag(argv, flags, "drop-pending-updates", false) } : {}),
        });
      }
      const processor = registerProcessor(claw);
      const assignment = assignCodex(claw);
      const commands = accountRecord ? await syncCommands(claw) : null;
      const shouldStart = readBooleanFlag(argv, flags, "start", false) || readBooleanFlag(argv, flags, "restart", false);
      const listener = shouldStart ? await startListener(claw, { restart: readBooleanFlag(argv, flags, "restart", false) }) : claw.channels.listeners.get(provider, account);
      const status = await readStatus(claw);
      const payload = { account: accountRecord, processor, assignment, commands, listener, status };
      if (wantsJson) writeJson(context.stdout, payload);
      else context.stdout.write(`telegram codex setup ${status.listenerStatus} commands=${status.commandsSynced ? "synced" : "pending"}\n`);
      return CLI_EXIT_OK;
    }

    if (codexCommand === "start") {
      const claw = await createCliClaw(codexRuntimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, argv);
      const listener = await startListener(claw, { restart: readBooleanFlag(argv, flags, "restart", false) });
      if (wantsJson) writeJson(context.stdout, listener);
      else context.stdout.write(`${listener.status} ${listener.pid ?? "unknown"}\n`);
      return listener.status === "running" ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }

    if (codexCommand === "stop") {
      const claw = await createCliClaw(codexRuntimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, argv);
      const listener = await stopListener(claw);
      if (wantsJson) writeJson(context.stdout, listener);
      else context.stdout.write("stopped\n");
      return CLI_EXIT_OK;
    }

    if (codexCommand === "status" || !codexCommand) {
      const claw = await createCliClaw(codexRuntimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, argv);
      const status = await readStatus(claw);
      if (wantsJson) writeJson(context.stdout, status);
      else context.stdout.write([
        `account=${status.accountId}`,
        `listener=${status.listenerStatus}`,
        `pid=${status.pid ?? "unknown"}`,
        `processor=${status.processorRegistered ? "registered" : "missing"}`,
        `commands=${status.commandsSynced ? "synced" : "pending"}`,
        ...(status.lastError ? [`lastError=${status.lastError}`] : []),
      ].join(" ") + "\n");
      return CLI_EXIT_OK;
    }

    if (codexCommand === "logs") {
      const paths = channelListenerPaths(workspaceRoot, provider, account);
      const lines = flags.lines ? Number(flags.lines) : 80;
      const output = readTail(paths.logPath, lines);
      if (wantsJson) writeJson(context.stdout, { log: output, logPath: paths.logPath });
      else context.stdout.write(output ? `${output}\n` : "");
      return output ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }

    if (codexCommand === "commands" && codexSubcommand === "sync") {
      const claw = await createCliClaw(codexRuntimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId, argv);
      const commands = await syncCommands(claw);
      if (!commands) {
        context.stderr.write("Telegram account is not configured. Run setup with --secret-name first.\n");
        return CLI_EXIT_DEGRADED;
      }
      if (wantsJson) writeJson(context.stdout, commands);
      else context.stdout.write(`synced ${commands.length} commands\n`);
      return CLI_EXIT_OK;
    }

    context.stderr.write(`Usage: ${binName} channels telegram codex setup|start|stop|status|logs|commands sync\n`);
    return CLI_EXIT_USAGE;
  }

  if (group === "channels" && command === "telegram" && subcommand === "connect") {
    const secretName = flags["secret-name"] || flags.secret;
    if (!secretName) {
      context.stderr.write("--secret-name is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const secret = await claw.telegram.provisionSecretReference({
      secretName,
      apiBaseUrl: flags["api-base-url"],
    });
    if (secret.status !== "configured") {
      if (wantsJson) {
        writeJson(context.stdout, secret);
      } else {
        context.stderr.write(`${secret.instructions.summary}\n`);
      }
      return CLI_EXIT_DEGRADED;
    }
    const account = await claw.channels.accounts.registerTelegramBot({
      accountId: flags.account,
      label: flags.name,
      secretName,
      apiBaseUrl: flags["api-base-url"],
      webhookUrl: flags["webhook-url"],
      webhookSecretToken: flags["webhook-secret-token"],
      allowedUpdates: parseJsonFlag<string[]>(flags["allowed-updates"], "--allowed-updates"),
      ...(flags["drop-pending-updates"] !== undefined ? { dropPendingUpdates: readBooleanFlag(argv, flags, "drop-pending-updates", false) } : {}),
    });
    if (wantsJson) {
      writeJson(context.stdout, account);
    } else {
      context.stdout.write(`${account.id} ${account.status}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "channels" && command === "processors") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    if (subcommand === "add" || subcommand === "register") {
      const id = flags.id || extractPositionals(argv)[3];
      const processorCommand = flags.command || flags.cmd;
      if (!id || !processorCommand) {
        context.stderr.write("--id and --command are required\n");
        return CLI_EXIT_USAGE;
      }
      const processor = claw.channels.processors.register({
        id,
        command: processorCommand,
        label: flags.name,
        cwd: flags.cwd,
        agentId: flags.agent || flags["agent-id"],
      });
      if (wantsJson) writeJson(context.stdout, processor);
      else context.stdout.write(`${processor.id}\n`);
      return CLI_EXIT_OK;
    }
    if (subcommand === "list" || !subcommand) {
      const processors = claw.channels.processors.list();
      if (wantsJson) writeJson(context.stdout, processors);
      else context.stdout.write(`${processors.map((entry) => `${entry.id} ${entry.command}`).join("\n")}\n`);
      return processors.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
    if (subcommand === "remove") {
      const id = flags.id || extractPositionals(argv)[3];
      if (!id) {
        context.stderr.write("--id is required\n");
        return CLI_EXIT_USAGE;
      }
      const removed = claw.channels.processors.remove(id);
      if (wantsJson) writeJson(context.stdout, { removed });
      else context.stdout.write(`${removed}\n`);
      return removed ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
  }

  if (group === "channels" && command === "listen") {
    const provider = flags.provider || flags.channel || "telegram";
    const account = flags.account;
    const paths = channelListenerPaths(workspaceRoot, provider, account);

    if (subcommand === "run") {
      const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
      const listener = await claw.channels.listen.run({
        provider,
        accountId: account,
        processorId: flags.processor,
        once: argv.includes("--once"),
        intervalMs: flags["interval-ms"] ? Number(flags["interval-ms"]) : undefined,
        timeoutSeconds: flags.timeout ? Number(flags.timeout) : undefined,
        processorTimeoutMs: flags["processor-timeout-ms"] ? Number(flags["processor-timeout-ms"]) : undefined,
        pidPath: paths.pidPath,
        stopPath: paths.stopPath,
        logPath: paths.logPath,
        mode: readBooleanFlag(argv, flags, "background", false) ? "background" : "foreground",
      });
      if (wantsJson) writeJson(context.stdout, listener);
      else context.stdout.write(`${listener.status}\n`);
      return CLI_EXIT_OK;
    }

    if (subcommand === "start") {
      fs.mkdirSync(paths.runDir, { recursive: true });
      fs.rmSync(paths.stopPath, { force: true });
      if (!readBooleanFlag(argv, flags, "background", false)) {
        const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
        const listener = await claw.channels.listen.run({
          provider,
          accountId: account,
          processorId: flags.processor,
          once: argv.includes("--once"),
          intervalMs: flags["interval-ms"] ? Number(flags["interval-ms"]) : undefined,
          timeoutSeconds: flags.timeout ? Number(flags.timeout) : undefined,
          processorTimeoutMs: flags["processor-timeout-ms"] ? Number(flags["processor-timeout-ms"]) : undefined,
          pidPath: paths.pidPath,
          stopPath: paths.stopPath,
          logPath: paths.logPath,
          mode: "foreground",
        });
        if (wantsJson) writeJson(context.stdout, listener);
        else context.stdout.write(`${listener.status}\n`);
        return CLI_EXIT_OK;
      }

      const entry = fileURLToPath(import.meta.url);
      const packagedBin = path.resolve(path.dirname(entry), "..", "bin", "claw.mjs");
      const cliEntry = fs.existsSync(packagedBin) ? packagedBin : entry;
      const args = [
        cliEntry,
        "channels",
        "listen",
        "run",
        "--provider",
        provider,
        "--workspace",
        workspaceRoot,
        "--runtime",
        runtimeAdapterId,
        "--background",
      ];
      if (account) args.push("--account", account);
      if (flags.processor) args.push("--processor", flags.processor);
      if (flags["interval-ms"]) args.push("--interval-ms", flags["interval-ms"]);
      if (flags.timeout) args.push("--timeout", flags.timeout);
      if (flags["processor-timeout-ms"]) args.push("--processor-timeout-ms", flags["processor-timeout-ms"]);
      const logFd = fs.openSync(paths.logPath, "a");
      const child = spawn(process.execPath, args, {
        cwd: context.cwd,
        env: process.env,
        detached: true,
        stdio: ["ignore", logFd, logFd],
      });
      fs.closeSync(logFd);
      child.unref();
      const pid = await waitForListenerPid(paths.pidPath);
      const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
      const listener = claw.channels.listeners.upsert({
        provider,
        accountId: account,
        processorId: flags.processor,
        mode: "background",
        status: pid ? "running" : "stale",
        pid: pid ?? child.pid,
        pidPath: paths.pidPath,
        stopPath: paths.stopPath,
        logPath: paths.logPath,
        startedAt: new Date().toISOString(),
        lastHeartbeatAt: new Date().toISOString(),
      });
      if (wantsJson) writeJson(context.stdout, listener);
      else context.stdout.write(`${listener.status} ${listener.pid ?? "unknown"}\n`);
      return pid ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }

    if (subcommand === "status" || !subcommand) {
      const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
      const listener = claw.channels.listeners.get(provider, account);
      const pid = listener?.pid ?? readListenerPid(paths.pidPath);
      const running = isProcessRunning(pid);
      const normalized = listener
        ? claw.channels.listeners.upsert({
          ...listener,
          provider,
          accountId: account,
          mode: listener.mode,
          status: running ? listener.status === "stopped" ? "stopped" : "running" : listener.status === "stopped" ? "stopped" : "stale",
          pid,
        })
        : null;
      if (wantsJson) writeJson(context.stdout, normalized ?? { provider, accountId: account ?? "default", status: running ? "running" : "stopped", pid });
      else context.stdout.write(`${normalized?.status ?? (running ? "running" : "stopped")} ${pid ?? "unknown"}\n`);
      return running ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }

    if (subcommand === "stop") {
      fs.mkdirSync(paths.runDir, { recursive: true });
      fs.writeFileSync(paths.stopPath, `${Date.now()}\n`);
      const pid = readListenerPid(paths.pidPath);
      const startedAt = Date.now();
      while (pid && isProcessRunning(pid) && Date.now() - startedAt < 5_000) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (pid && isProcessRunning(pid)) {
        try {
          process.kill(pid, "SIGTERM");
        } catch {
          // already stopped
        }
      }
      const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
      const listener = claw.channels.listeners.upsert({
        provider,
        accountId: account,
        processorId: flags.processor,
        mode: "background",
        status: "stopped",
        pid,
        pidPath: paths.pidPath,
        stopPath: paths.stopPath,
        logPath: paths.logPath,
        stoppedAt: new Date().toISOString(),
      });
      if (wantsJson) writeJson(context.stdout, listener);
      else context.stdout.write("stopped\n");
      return CLI_EXIT_OK;
    }

    if (subcommand === "logs") {
      const lines = flags.lines ? Number(flags.lines) : 80;
      const output = readTail(paths.logPath, lines);
      if (wantsJson) writeJson(context.stdout, { log: output });
      else context.stdout.write(output ? `${output}\n` : "");
      return output ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
  }

  if (group === "channels" && command === "codex-processor") {
    if (subcommand && subcommand !== "run") {
      context.stderr.write(`Usage: ${binName} channels codex-processor run --runtime codex --workspace PATH\n`);
      return CLI_EXIT_USAGE;
    }
    return await runTelegramCodexProcessor({
      context,
      flags,
      argv,
      workspaceRoot,
      appId,
      workspaceId,
      agentId,
      runtimeAdapterId,
    });
  }

  if (group === "channels" && command === "accounts" && subcommand === "add") {
    const provider = extractPositionals(argv)[3] || flags.provider || flags.channel;
    if (provider !== "telegram") {
      context.stderr.write("only telegram accounts are supported\n");
      return CLI_EXIT_USAGE;
    }
    const secretName = flags["secret-name"] || flags.secret;
    if (!secretName) {
      context.stderr.write("--secret-name is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const account = await claw.channels.accounts.registerTelegramBot({
      accountId: flags.account,
      label: flags.name,
      secretName,
      apiBaseUrl: flags["api-base-url"],
      webhookUrl: flags["webhook-url"],
      webhookSecretToken: flags["webhook-secret-token"],
      allowedUpdates: parseJsonFlag<string[]>(flags["allowed-updates"], "--allowed-updates"),
      ...(flags["drop-pending-updates"] !== undefined ? { dropPendingUpdates: readBooleanFlag(argv, flags, "drop-pending-updates", false) } : {}),
    });
    if (wantsJson) {
      writeJson(context.stdout, account);
    } else {
      context.stdout.write(`${account.id} ${account.status}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "channels" && command === "accounts" && (subcommand === "list" || subcommand === "status")) {
    const provider = flags.provider || flags.channel;
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const accounts = subcommand === "status"
      ? await claw.channels.accounts.status(provider)
      : claw.channels.accounts.list(provider);
    if (wantsJson) {
      writeJson(context.stdout, accounts);
    } else {
      context.stdout.write(`${accounts.map((entry) => `${entry.id}:${entry.status}`).join("\n")}\n`);
    }
    return accounts.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "channels" && command === "accounts" && subcommand === "remove") {
    const provider = flags.provider || flags.channel || extractPositionals(argv)[3];
    if (!provider) {
      context.stderr.write("--provider is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const accounts = await claw.channels.accounts.remove(provider, flags.account);
    if (wantsJson) {
      writeJson(context.stdout, accounts);
    } else {
      context.stdout.write(`${accounts.map((entry) => entry.id).join("\n")}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "channels" && command === "targets" && subcommand === "register") {
    const provider = flags.provider || flags.channel || "telegram";
    const targetId = flags["target-id"] || flags.target || flags["chat-id"];
    if (!targetId) {
      context.stderr.write("--target-id is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const target = claw.channels.targets.register({
      provider,
      accountId: flags.account,
      targetId,
      kind: (flags.kind as "dm" | "group" | "supergroup" | "channel" | "topic" | "unknown" | undefined) ?? "unknown",
      label: flags.label || flags.title || flags.username,
      title: flags.title,
      username: flags.username,
      parentTargetId: flags["parent-target-id"],
      threadId: flags["thread-id"] || flags["message-thread-id"],
    });
    if (wantsJson) {
      writeJson(context.stdout, target);
    } else {
      context.stdout.write(`${target.id}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "channels" && command === "targets" && subcommand === "list") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const targets = claw.channels.targets.list({
      provider: flags.provider || flags.channel,
      accountId: flags.account,
      query: flags.query,
    });
    if (wantsJson) {
      writeJson(context.stdout, targets);
    } else {
      context.stdout.write(`${targets.map((entry) => `${entry.id} ${entry.label ?? ""}`.trim()).join("\n")}\n`);
    }
    return targets.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "channels" && command === "targets" && (subcommand === "inspect" || subcommand === "get")) {
    const provider = flags.provider || flags.channel || "telegram";
    const targetId = flags["target-id"] || flags.target || flags["chat-id"] || extractPositionals(argv)[3];
    if (!targetId) {
      context.stderr.write("--target-id is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const target = claw.channels.targets.get(provider, flags.account, targetId, flags["thread-id"] || flags["message-thread-id"]);
    if (wantsJson) {
      writeJson(context.stdout, target ?? { targetId, found: false });
    } else if (target) {
      context.stdout.write(`${target.id} ${target.kind}${target.metadata?.instructions ? " instructions" : ""}\n`);
    }
    return target ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "channels" && command === "targets" && (subcommand === "update" || subcommand === "set")) {
    const provider = flags.provider || flags.channel || "telegram";
    const targetId = flags["target-id"] || flags.target || flags["chat-id"] || extractPositionals(argv)[3];
    if (!targetId) {
      context.stderr.write("--target-id is required\n");
      return CLI_EXIT_USAGE;
    }
    const threadId = flags["thread-id"] || flags["message-thread-id"];
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const existing = claw.channels.targets.get(provider, flags.account, targetId, threadId);
    const metadata = parseJsonFlag<Record<string, unknown>>(flags.metadata, "--metadata") ?? {};
    if (flags.instructions !== undefined) metadata.instructions = flags.instructions;
    const target = claw.channels.targets.register({
      provider,
      accountId: flags.account,
      targetId,
      kind: (flags.kind as "dm" | "group" | "supergroup" | "channel" | "topic" | "unknown" | undefined) ?? existing?.kind ?? (threadId ? "topic" : "unknown"),
      label: flags.label || flags.title || flags.username || existing?.label,
      title: flags.title || existing?.title,
      username: flags.username || existing?.username,
      parentTargetId: flags["parent-target-id"] || existing?.parentTargetId,
      threadId: threadId ?? existing?.threadId,
      metadata: {
        ...(existing?.metadata ?? {}),
        ...metadata,
      },
    });
    if (wantsJson) {
      writeJson(context.stdout, target);
    } else {
      context.stdout.write(`${target.id}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "channels" && command === "permissions" && subcommand === "grant") {
    if (!flags.agent) {
      context.stderr.write("--agent is required\n");
      return CLI_EXIT_USAGE;
    }
    const permissions = parseCsvFlag(flags.permissions || flags.permission);
    if (permissions.length === 0) {
      context.stderr.write("--permissions is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const binding = claw.channels.bindings.grant({
      agentId: flags.agent,
      provider: flags.provider || flags.channel,
      accountId: flags.account,
      targetId: flags["target-id"] || flags.target || flags["chat-id"],
      permissions: permissions as Array<"read" | "write" | "ingest" | "admin">,
      ...(flags.priority ? { priority: Number(flags.priority) } : {}),
    });
    if (wantsJson) {
      writeJson(context.stdout, binding);
    } else {
      context.stdout.write(`${binding.id}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "channels" && command === "permissions" && subcommand === "list") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const bindings = claw.channels.bindings.list({
      agentId: flags.agent,
      provider: flags.provider || flags.channel,
      accountId: flags.account,
      targetId: flags["target-id"] || flags.target || flags["chat-id"],
    });
    if (wantsJson) {
      writeJson(context.stdout, bindings);
    } else {
      context.stdout.write(`${bindings.map((entry) => `${entry.id} ${entry.permissions.join(",")}`).join("\n")}\n`);
    }
    return bindings.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "channels" && command === "permissions" && subcommand === "revoke") {
    const id = flags.id || extractPositionals(argv)[3];
    if (!id) {
      context.stderr.write("--id is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const removed = claw.channels.bindings.revoke(id);
    if (wantsJson) {
      writeJson(context.stdout, { removed });
    } else {
      context.stdout.write(`${removed}\n`);
    }
    return removed ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "channels" && command === "messages" && subcommand === "send") {
    const targetId = flags["target-id"] || flags.target || flags["chat-id"];
    if (!targetId) {
      context.stderr.write("--target-id is required\n");
      return CLI_EXIT_USAGE;
    }
    if (!flags.text && !flags.media) {
      context.stderr.write("--text or --media is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const message = await claw.channels.messages.send({
      provider: flags.provider || flags.channel || "telegram",
      accountId: flags.account,
      targetId,
      text: flags.text,
      media: flags.media,
      mediaType: flags["media-type"] as "photo" | "video" | "document" | "audio" | "animation" | undefined,
      threadId: flags["thread-id"] || flags["message-thread-id"],
      parseMode: flags["parse-mode"] as "HTML" | "Markdown" | "MarkdownV2" | undefined,
      agentId: flags.agent,
    });
    if (wantsJson) {
      writeJson(context.stdout, message);
    } else {
      context.stdout.write(`${message.id}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "channels" && command === "messages" && subcommand === "sync") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const messages = await claw.channels.messages.sync({
      provider: flags.provider || flags.channel || "telegram",
      accountId: flags.account,
      ...(flags.limit ? { limit: Number(flags.limit) } : {}),
      ...(flags.timeout ? { timeoutSeconds: Number(flags.timeout) } : {}),
    });
    if (wantsJson) {
      writeJson(context.stdout, messages);
    } else {
      context.stdout.write(`${messages.map((entry) => entry.id).join("\n")}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "channels" && command === "messages" && subcommand === "read") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const messages = claw.channels.messages.read({
      provider: flags.provider || flags.channel,
      accountId: flags.account,
      targetId: flags["target-id"] || flags.target || flags["chat-id"],
      agentId: flags.agent,
      ...(flags.limit ? { limit: Number(flags.limit) } : {}),
    });
    if (wantsJson) {
      writeJson(context.stdout, messages);
    } else {
      context.stdout.write(`${messages.map((entry) => `${entry.id} ${entry.text ?? ""}`.trim()).join("\n")}\n`);
    }
    return messages.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "channels" && command === "commands" && (subcommand === "set" || subcommand === "get")) {
    const provider = (flags.provider || flags.channel || "telegram") as "telegram";
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const result = subcommand === "set"
      ? await claw.channels.commands.set(provider, parseJsonFlag<Array<{ command: string; description: string }>>(flags.commands, "--commands") ?? [], { accountId: flags.account })
      : await claw.channels.commands.get(provider, { accountId: flags.account });
    if (wantsJson) {
      writeJson(context.stdout, result);
    } else {
      context.stdout.write(`${result.map((entry) => `${entry.command}: ${entry.description}`).join("\n")}\n`);
    }
    return result.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
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
      ruleHints: parseRuleHints(flags),
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

  if (group === "media" && command === "list") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId) as CliMediaClaw;
    const media = claw.media.list(buildMediaListInput(flags));
    if (wantsJson) {
      writeJson(context.stdout, media);
    } else {
      context.stdout.write(`${media.map((entry) => `${entry.mediaId} ${entry.kind} ${entry.name}`).join("\n")}\n`);
    }
    return media.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "media" && command === "search") {
    const query = flags.query || subcommand;
    if (!query?.trim()) {
      context.stderr.write("--query is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId) as CliMediaClaw;
    const results = claw.media.search({
      ...buildMediaListInput(flags),
      query: query.trim(),
    });
    if (wantsJson) {
      writeJson(context.stdout, results);
    } else {
      context.stdout.write(`${results.map((entry) => `${entry.mediaId} ${entry.kind} ${entry.name}`).join("\n")}\n`);
    }
    return results.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "media" && command === "read") {
    const mediaId = flags["media-id"] ?? flags.id;
    if (!mediaId) {
      context.stderr.write("--media-id is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId) as CliMediaClaw;
    const media = claw.media.get(mediaId);
    if (wantsJson) {
      writeJson(context.stdout, media);
    } else {
      context.stdout.write(`${media?.name ?? "missing"}\n`);
    }
    return media ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
  }

  if (group === "media" && command === "download") {
    const mediaId = flags["media-id"] ?? flags.id;
    if (!mediaId) {
      context.stderr.write("--media-id is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId) as CliMediaClaw;
    const download = claw.media.download(mediaId);
    if (!download) {
      if (wantsJson) writeJson(context.stdout, null);
      else context.stdout.write("missing\n");
      return CLI_EXIT_FAILURE;
    }
    const outputPath = path.resolve(context.cwd, flags.out || flags.output || download.media.name);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, download.buffer);
    if (wantsJson) {
      writeJson(context.stdout, {
        media: download.media,
        outputPath,
        sizeBytes: download.buffer.length,
      });
    } else {
      context.stdout.write(`${outputPath}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "media" && command === "share" && subcommand === "create") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId) as CliMediaClaw;
    const share = await claw.media.share.create({
      mediaId: flags["media-id"] ?? flags.id,
      label: flags.label,
      filters: flags["media-id"] || flags.id ? undefined : buildMediaListInput(flags),
      expiresAt: flags["expires-at"],
      ...(flags["ttl-ms"] ? { ttlMs: Number(flags["ttl-ms"]) } : {}),
    });
    if (wantsJson) {
      writeJson(context.stdout, share);
    } else {
      context.stdout.write(`${share.url}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "media" && command === "share" && subcommand === "list") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId) as CliMediaClaw;
    const shares = claw.media.share.list();
    if (wantsJson) {
      writeJson(context.stdout, shares);
    } else {
      context.stdout.write(`${shares.map((share) => `${share.id} ${share.url}`).join("\n")}\n`);
    }
    return shares.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "media" && command === "share" && subcommand === "revoke") {
    const id = flags["share-id"] ?? flags.id;
    if (!id) {
      context.stderr.write("--share-id is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId) as CliMediaClaw;
    const revoked = await claw.media.share.revoke(id);
    if (wantsJson) {
      writeJson(context.stdout, { revoked, id });
    } else {
      context.stdout.write(`${revoked}\n`);
    }
    return revoked ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "media" && command === "share" && subcommand === "resolve") {
    const id = flags["share-id"] ?? flags.id;
    if (!id) {
      context.stderr.write("--share-id is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId) as CliMediaClaw;
    const resolved = claw.media.share.resolveGallery(id);
    if (wantsJson) {
      writeJson(context.stdout, resolved);
    } else {
      context.stdout.write(`${resolved?.items.map((entry) => `${entry.mediaId} ${entry.name}`).join("\n") ?? "missing"}\n`);
    }
    return resolved ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
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
      ruleHints: parseRuleHints(flags),
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

  if (group === "stt" && command === "providers") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const providers = claw.stt.providers();
    if (wantsJson) {
      writeJson(context.stdout, providers);
    } else {
      context.stdout.write(`${providers.map((provider) => provider.id).join("\n")}\n`);
    }
    return providers.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "stt" && command === "config") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const config = claw.stt.config();
    if (wantsJson) {
      writeJson(context.stdout, config);
    } else {
      context.stdout.write(`${config.provider ?? "local-whisper"}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "stt" && command === "set-config") {
    const config = parseJsonFlag<Record<string, unknown>>(flags["config-json"], "--config-json") ?? {
      provider: "local-whisper",
      ...(flags.enabled !== undefined || argv.includes("--enabled") ? { enabled: readBooleanFlag(argv, flags, "enabled", false) } : {}),
      ...(flags["binary-path"] ? { binaryPath: flags["binary-path"] } : {}),
      ...(flags["ffmpeg-path"] ? { ffmpegPath: flags["ffmpeg-path"] } : {}),
      ...(flags["model-path"] ? { modelPath: flags["model-path"] } : {}),
      ...(flags.language || flags.lang ? { language: flags.language ?? flags.lang } : {}),
      ...(flags.translate !== undefined || argv.includes("--translate") ? { translate: readBooleanFlag(argv, flags, "translate", false) } : {}),
      ...(flags.threads ? { threads: Number(flags.threads) } : {}),
    };
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const next = claw.stt.setConfig(config);
    if (wantsJson) {
      writeJson(context.stdout, next);
    } else {
      context.stdout.write(`${next.provider ?? "local-whisper"}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "stt" && command === "transcribe") {
    const filePath = flags.file || flags.input || subcommand;
    if (!filePath?.trim()) {
      context.stderr.write("--file is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const result = await claw.stt.transcribe({
      filePath: path.resolve(context.cwd, filePath),
      provider: "local-whisper",
      ...(flags["binary-path"] ? { binaryPath: flags["binary-path"] } : {}),
      ...(flags["ffmpeg-path"] ? { ffmpegPath: flags["ffmpeg-path"] } : {}),
      ...(flags["model-path"] ? { modelPath: flags["model-path"] } : {}),
      ...(flags.language || flags.lang ? { language: flags.language ?? flags.lang } : {}),
      ...(flags.translate !== undefined || argv.includes("--translate") ? { translate: readBooleanFlag(argv, flags, "translate", false) } : {}),
      ...(flags.threads ? { threads: Number(flags.threads) } : {}),
    });
    if (wantsJson) {
      writeJson(context.stdout, result);
    } else {
      context.stdout.write(`${result.text}\n`);
    }
    return result.text ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  }

  if (group === "voice-notes" && (command === "add" || command === "create")) {
    const filePath = flags.file || flags.input || subcommand;
    if (!filePath?.trim()) {
      context.stderr.write("--file is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const note = claw.voiceNotes.registerPath({
      filePath: path.resolve(context.cwd, filePath),
      mimeType: flags["mime-type"] || inferMimeTypeFromPath(filePath),
      fileName: flags.name,
      durationSeconds: flags.duration ? Number(flags.duration) : undefined,
      source: {
        origin: flags.origin || "cli",
        provider: flags.provider,
        accountId: flags.account,
        targetId: flags["target-id"],
        threadId: flags["thread-id"],
        providerMessageId: flags["message-id"],
        senderId: flags["sender-id"],
        senderLabel: flags["sender-label"],
        metadata: parseJsonFlag<Record<string, unknown>>(flags["metadata-json"], "--metadata-json") ?? undefined,
      },
      tags: parseCsvFlag(flags.tags),
    });
    if (wantsJson) {
      writeJson(context.stdout, note);
    } else {
      context.stdout.write(`${note.id}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "voice-notes" && command === "list") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const notes = claw.voiceNotes.list({
      origin: flags.origin,
      provider: flags.provider,
      accountId: flags.account,
      targetId: flags["target-id"],
      threadId: flags["thread-id"],
      status: flags.status as VoiceNoteStatus | undefined,
      query: flags.query,
      limit: flags.limit ? Number(flags.limit) : undefined,
    });
    if (wantsJson) {
      writeJson(context.stdout, notes);
    } else {
      context.stdout.write(`${notes.map((note) => `${note.id}\t${note.status}\t${note.source.origin}\t${note.transcript?.text ?? ""}`).join("\n")}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "voice-notes" && (command === "get" || command === "read" || command === "inspect")) {
    const id = subcommand || flags.id;
    if (!id) {
      context.stderr.write("voice note id is required\n");
      return CLI_EXIT_USAGE;
    }
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const note = claw.voiceNotes.get(id);
    if (!note) {
      context.stderr.write(`voice note not found: ${id}\n`);
      return CLI_EXIT_DEGRADED;
    }
    if (wantsJson) {
      writeJson(context.stdout, note);
    } else {
      context.stdout.write(`${note.transcript?.text ?? note.id}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "voice-notes" && command === "transcribe") {
    const claw = await createCliClaw(runtimeAdapterId, flags, workspaceRoot, appId, workspaceId, agentId);
    const id = subcommand || flags.id;
    if (!id && !(flags.file || flags.input)) {
      context.stderr.write("voice note id or --file is required\n");
      return CLI_EXIT_USAGE;
    }
    const note = id
      ? await claw.voiceNotes.transcribe(id, {
        provider: "local-whisper",
        ...(flags["binary-path"] ? { binaryPath: flags["binary-path"] } : {}),
        ...(flags["ffmpeg-path"] ? { ffmpegPath: flags["ffmpeg-path"] } : {}),
        ...(flags["model-path"] ? { modelPath: flags["model-path"] } : {}),
        ...(flags.language || flags.lang ? { language: flags.language ?? flags.lang } : {}),
        ...(flags.translate !== undefined || argv.includes("--translate") ? { translate: readBooleanFlag(argv, flags, "translate", false) } : {}),
        ...(flags.threads ? { threads: Number(flags.threads) } : {}),
      })
      : await (async () => {
        const created = claw.voiceNotes.registerPath({
          filePath: path.resolve(context.cwd, flags.file || flags.input),
          mimeType: flags["mime-type"] || inferMimeTypeFromPath(flags.file || flags.input),
          source: { origin: flags.origin || "cli", provider: flags.provider },
        });
        return claw.voiceNotes.transcribe(created.id, {
          provider: "local-whisper",
          ...(flags["binary-path"] ? { binaryPath: flags["binary-path"] } : {}),
          ...(flags["ffmpeg-path"] ? { ffmpegPath: flags["ffmpeg-path"] } : {}),
          ...(flags["model-path"] ? { modelPath: flags["model-path"] } : {}),
          ...(flags.language || flags.lang ? { language: flags.language ?? flags.lang } : {}),
          ...(flags.translate !== undefined || argv.includes("--translate") ? { translate: readBooleanFlag(argv, flags, "translate", false) } : {}),
          ...(flags.threads ? { threads: Number(flags.threads) } : {}),
        });
      })();
    if (wantsJson) {
      writeJson(context.stdout, note);
    } else {
      context.stdout.write(`${note.transcript?.text ?? ""}\n`);
    }
    return note.status === "transcribed" ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
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

  if (group === "image" && command === "create") {
    const prompt = flags.prompt;
    if (!prompt) {
      context.stderr.write("--prompt is required\n");
      return CLI_EXIT_USAGE;
    }
    const { media } = await getImageGenerationFacade();
    const record = await media.generate({
      prompt,
      ...buildImageCommonInput(flags),
      backendId: flags.backend,
      command: flags.command,
      args: parseJsonFlag<string[]>(flags["args-json"], "--args-json"),
      cwd: flags.cwd,
      env: parseJsonFlag<Record<string, string>>(flags["env-json"], "--env-json"),
      outputExtension: flags.ext,
      mimeType: flags["mime-type"],
      allowEnvCredentials: readBooleanFlag(argv, flags, "allow-env-credentials", false),
    });
    if (wantsJson) {
      writeJson(context.stdout, record);
    } else {
      context.stdout.write(`${record.id} ${record.output?.filePath ?? "missing-output"}\n`);
    }
    return record.status === "succeeded" ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
  }

  if (group === "image" && command === "edit") {
    const prompt = flags.prompt;
    const parentId = flags.id || flags["parent-id"];
    if (!prompt || !parentId) {
      context.stderr.write("--id and --prompt are required\n");
      return CLI_EXIT_USAGE;
    }
    const { media } = await getImageGenerationFacade();
    const record = await media.edit({
      parentId,
      prompt,
      ...buildImageCommonInput(flags),
      sourceImageIds: parseCsvFlag(flags["source-image-ids"]),
      backendId: flags.backend,
      command: flags.command,
      args: parseJsonFlag<string[]>(flags["args-json"], "--args-json"),
      cwd: flags.cwd,
      env: parseJsonFlag<Record<string, string>>(flags["env-json"], "--env-json"),
      outputExtension: flags.ext,
      mimeType: flags["mime-type"],
      allowEnvCredentials: readBooleanFlag(argv, flags, "allow-env-credentials", false),
    });
    if (wantsJson) {
      writeJson(context.stdout, record);
    } else {
      context.stdout.write(`${record.id} ${record.output?.filePath ?? "missing-output"}\n`);
    }
    return record.status === "succeeded" ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
  }

  if (group === "image" && command === "import") {
    const filePath = flags.file || flags.path;
    if (!filePath) {
      context.stderr.write("--file is required\n");
      return CLI_EXIT_USAGE;
    }
    const { media } = await getImageGenerationFacade();
    const record = media.import({
      filePath,
      prompt: flags.prompt,
      ...buildImageCommonInput(flags),
      provider: flags.provider,
      requestId: flags["request-id"],
      parentId: flags["parent-id"],
      sourceImageIds: parseCsvFlag(flags["source-image-ids"]),
      provenance: (flags.provenance as "generated-by-system" | "imported-codex" | "imported-chatgpt" | "imported-manual" | "command-backend" | "custom" | undefined) ?? "imported-manual",
      externalGenerator: flags["external-generator"],
      backendId: flags.backend,
      backendLabel: flags["backend-label"],
    });
    if (wantsJson) {
      writeJson(context.stdout, record);
    } else {
      context.stdout.write(`${record.id} ${record.output?.filePath ?? "missing-output"}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (group === "image" && command === "show") {
    const id = flags.id;
    if (!id) {
      context.stderr.write("--id is required\n");
      return CLI_EXIT_USAGE;
    }
    const { media } = await getImageGenerationFacade();
    const record = media.get(id);
    if (wantsJson) {
      writeJson(context.stdout, record);
    } else {
      context.stdout.write(`${record?.output?.filePath ?? "missing"}\n`);
    }
    return record ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
  }

  if (mediaGroup && command === "generate") {
    const prompt = flags.prompt;
    if (!prompt) {
      context.stderr.write("--prompt is required\n");
      return CLI_EXIT_USAGE;
    }
    if (mediaGroup === "image") {
      const { media } = await getImageGenerationFacade();
      const record = await media.generate({
        prompt,
        ...buildImageCommonInput(flags),
        backendId: flags.backend,
        command: flags.command,
        args: parseJsonFlag<string[]>(flags["args-json"], "--args-json"),
        cwd: flags.cwd,
        env: parseJsonFlag<Record<string, string>>(flags["env-json"], "--env-json"),
        outputExtension: flags.ext,
        mimeType: flags["mime-type"],
        allowEnvCredentials: readBooleanFlag(argv, flags, "allow-env-credentials", false),
      });
      if (wantsJson) {
        writeJson(context.stdout, record);
      } else {
        context.stdout.write(`${record.id} ${record.output?.filePath ?? "missing-output"}\n`);
      }
      return record.status === "succeeded" ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
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
    if (mediaGroup === "image") {
      const { media } = await getImageGenerationFacade();
      const records = media.list({
        ...(flags.backend ? { backendId: flags.backend } : {}),
        ...(flags.status ? { status: flags.status as "succeeded" | "failed" } : {}),
        ...(flags.limit ? { limit: Number(flags.limit) } : {}),
        ...(flags.query ? { query: flags.query } : {}),
        ...(parseImageType(flags.type) ? { imageType: parseImageType(flags.type) } : {}),
        ...(flags.project ? { project: flags.project } : {}),
        ...(flags.provider ? { provider: flags.provider } : {}),
        ...(flags.model ? { model: flags.model } : {}),
        ...(parseImageProvenance(flags.provenance) ? { provenance: parseImageProvenance(flags.provenance) } : {}),
        ...(flags.tag ? { tag: flags.tag } : {}),
        ...(parseImageOperation(flags.operation) ? { operation: parseImageOperation(flags.operation) } : {}),
      });
      if (wantsJson) {
        writeJson(context.stdout, records);
      } else {
        context.stdout.write(`${records.map((record: { id: string; status: string; title: string }) => `${record.id} ${record.status} ${record.title}`).join("\n")}\n`);
      }
      return records.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
    }
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

  if (group && HOST_FORWARD_DOMAINS.has(group as ClawDomain)) {
    return await runDirectHostDomainCli({ positionals, flags, context, wantsJson });
  }

  context.stderr.write(`${usage}\n`);
  return CLI_EXIT_USAGE;
}

export async function runCli(argv: string[], context: CliContext): Promise<number> {
  const wantsJson = argv.includes("--json");
  try {
    return await runCliUnsafe(argv, context);
  } catch (error) {
    const handled = cliErrorFromUnknown(error);
    if (wantsJson) {
      writeCliError(context.stdout, handled);
    } else {
      context.stderr.write(`${handled.message}\n`);
    }
    return handled.exitCode;
  }
}
