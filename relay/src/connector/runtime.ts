import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { applyTextMutation, createClaw } from "@clawjs/claw";
import type { RuntimeAdapterId, RuntimeProbeStatus } from "@clawjs/claw";
import { extendClawWithWorkspace } from "@clawjs/workspace";
import WebSocket from "ws";

import { BrowserSessionManager } from "../../../browser/host/session-manager.ts";
import type { BrowserActor, BrowserInputCommand } from "../../../browser/shared/types.ts";
import { WorkspaceCompatStore } from "./compat-store.ts";

export interface RelayConnectorOptions {
  relayUrl: string;
  enrollmentToken: string;
  connectorId: string;
  agentId: string;
  workspaceRoot: string;
  runtimeAdapter: string;
  runtimeBinaryPath?: string;
  credentialPath?: string;
  services?: RelayConnectorServiceConfig[];
}

export interface RelayConnectorServiceConfig {
  serviceId: string;
  displayName?: string;
  baseUrl: string;
}

export interface RelayConnectorRuntimeSummary {
  adapter: RuntimeAdapterId;
  runtimeName?: string;
  version: string | null;
  installed?: boolean;
  cliAvailable: boolean;
  gatewayAvailable: boolean;
  online: boolean;
  transport: string;
  issues: string[];
}

type RelayConnectorEventEmitter = (event: string, payload: Record<string, unknown>) => void;

interface RuntimeContext {
  claw: Awaited<ReturnType<typeof createClaw>>;
  workspaceClaw: Awaited<ReturnType<typeof extendClawWithWorkspace>>;
  workspaceDir: string;
  compat: WorkspaceCompatStore;
  metadata: WorkspaceMaterialization;
}

interface WorkspaceMaterialization {
  workspaceId: string;
  displayName: string;
  workspaceDir: string;
  logicalAgentId: string;
  runtimeAgentId: string;
  materializationVersion: number;
  projectId?: string;
  legacy?: boolean;
}

const DEFAULT_PERSONAS = [
  {
    id: "assistant",
    name: "Assistant",
    avatar: "bot",
    role: "General Purpose",
    systemPrompt: "You are a helpful assistant.",
    skills: ["session"],
    channels: ["Chat"],
    isDefault: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
];

const DEFAULT_PLUGINS = [
  {
    id: "clawjs-tools",
    name: "clawjs-tools",
    version: "0.1.0",
    description: "Relay compatibility plugin catalog.",
    status: "active",
    config: {},
    installedAt: Date.now(),
    lastActivity: Date.now(),
  },
];

function toTimestamp(value: string | number | undefined): number {
  if (!value) return Date.now();
  if (typeof value === "number") return value;
  return new Date(value).getTime() || Date.now();
}

function sanitizePathSegment(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "default";
}

function getLegacyWorkspaceDir(root: string, workspaceId: string): string {
  return path.join(root, workspaceId);
}

function getProjectBaseDir(root: string, projectId: string): string {
  return path.join(root, "projects", sanitizePathSegment(projectId), "base");
}

function getAgentTemplateDir(root: string, agentId: string): string {
  return path.join(root, "agents", sanitizePathSegment(agentId), "template");
}

function getMaterializedWorkspaceDir(root: string, projectId: string, agentId: string): string {
  return path.join(root, "materialized", sanitizePathSegment(projectId), sanitizePathSegment(agentId));
}

function getAssignmentRegistryDir(root: string): string {
  return path.join(root, ".relay", "assignments");
}

function getAssignmentRegistryPath(root: string, workspaceId: string): string {
  return path.join(getAssignmentRegistryDir(root), `${workspaceId}.json`);
}

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJsonFile<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

function writeJsonFile(filePath: string, value: unknown): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function appendUniquePath(basePath: string | undefined, entries: string[]): string {
  const seen = new Set<string>();
  const parts = [
    ...(basePath?.split(path.delimiter).filter(Boolean) ?? []),
    ...entries,
  ].filter((entry) => {
    if (seen.has(entry)) return false;
    seen.add(entry);
    return true;
  });
  return parts.join(path.delimiter);
}

function resolveRuntimeBinaryPath(adapter: string, configured?: string): string | undefined {
  if (configured?.trim()) return configured.trim();
  if (adapter === "codex") {
    for (const candidate of ["/opt/homebrew/bin/codex", "/usr/local/bin/codex"]) {
      if (fs.existsSync(candidate)) return candidate;
    }
    return process.env.CLAWJS_CODEX_PATH?.trim() || undefined;
  }
  if (adapter === "openclaw") {
    return process.env.CLAWJS_OPENCLAW_PATH?.trim() || undefined;
  }
  return undefined;
}

function buildRuntimeEnv(adapter: string, configuredBinaryPath?: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: appendUniquePath(process.env.PATH, [
      "/opt/homebrew/bin",
      "/usr/local/bin",
      "/usr/bin",
      "/bin",
      "/usr/sbin",
      "/sbin",
    ]),
  };
  const binaryPath = resolveRuntimeBinaryPath(adapter, configuredBinaryPath);
  if (adapter === "codex" && binaryPath) {
    env.CLAWJS_CODEX_PATH = binaryPath;
  }
  if (adapter === "openclaw" && binaryPath) {
    env.CLAWJS_OPENCLAW_PATH = binaryPath;
  }
  return env;
}

function summarizeRuntimeStatus(status: RuntimeProbeStatus): RelayConnectorRuntimeSummary {
  const issues: string[] = [];
  if (!status.cliAvailable) issues.push(`${status.runtimeName} CLI is not available.`);
  if (status.cliAvailable && status.capabilityMap.auth?.status !== "ready") {
    issues.push(`${status.runtimeName} auth is not ready.`);
  }
  if (status.cliAvailable && status.capabilityMap.session_gateway?.status === "degraded") {
    issues.push(`${status.runtimeName} gateway is degraded; CLI fallback may be used.`);
  }
  return {
    adapter: status.adapter,
    runtimeName: status.runtimeName,
    version: status.version,
    installed: status.installed,
    cliAvailable: status.cliAvailable,
    gatewayAvailable: status.gatewayAvailable,
    online: status.cliAvailable && status.capabilityMap.auth?.status === "ready",
    transport: status.capabilityMap.streaming?.strategy ?? "unknown",
    issues,
  };
}

function renderRefsSection(
  title: string,
  refs: Array<{ id: string; label?: string; mode?: string; uri?: string; secretName?: string }>,
): string {
  return [
    `## ${title}`,
    "",
    ...(
      refs.length > 0
        ? refs.map((ref) => {
            const label = ref.label ?? ref.id;
            const target = ref.uri ?? ref.secretName ?? ref.id;
            const mode = ref.mode ?? "allow";
            return `- ${label}: ${target} (${mode})`;
          })
        : ["- none"]
    ),
  ].join("\n");
}

function upsertManagedBlocks(filePath: string, title: string, blocks: Array<{ blockId: string; content: string }>): void {
  const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : `${title}\n\n`;
  let next = existing;
  for (const block of blocks) {
    next = applyTextMutation({
      originalContent: next,
      mode: "managed_block",
      blockId: block.blockId,
      content: block.content,
    });
  }
  fs.writeFileSync(filePath, next.endsWith("\n") ? next : `${next}\n`);
}

export class RelayConnectorRuntime {
  private readonly contexts = new Map<string, Promise<RuntimeContext>>();
  private readonly serviceSockets = new Map<string, WebSocket>();
  private readonly browser: BrowserSessionManager;
  private readonly runtimeEnv: NodeJS.ProcessEnv;
  private readonly runtimeBinaryPath: string | undefined;

  constructor(
    private readonly options: RelayConnectorOptions,
    private readonly emitEvent?: RelayConnectorEventEmitter,
  ) {
    this.runtimeEnv = buildRuntimeEnv(options.runtimeAdapter, options.runtimeBinaryPath);
    this.runtimeBinaryPath = resolveRuntimeBinaryPath(options.runtimeAdapter, options.runtimeBinaryPath);
    this.browser = new BrowserSessionManager({
      onState: (event) => this.emitEvent?.("browser.state", event as unknown as Record<string, unknown>),
      onFrame: (event) => this.emitEvent?.("browser.frame", event as unknown as Record<string, unknown>),
    });
  }

  listWorkspaces(): Array<{ workspaceId: string; displayName: string }> {
    ensureDir(this.options.workspaceRoot);
    const workspaces = new Map<string, { workspaceId: string; displayName: string }>();

    const registryDir = getAssignmentRegistryDir(this.options.workspaceRoot);
    if (fs.existsSync(registryDir)) {
      for (const entry of fs.readdirSync(registryDir, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
        const metadata = readJsonFile<WorkspaceMaterialization>(path.join(registryDir, entry.name));
        if (!metadata) continue;
        workspaces.set(metadata.workspaceId, {
          workspaceId: metadata.workspaceId,
          displayName: metadata.displayName,
        });
      }
    }

    const reserved = new Set([".relay", "projects", "agents", "materialized"]);
    for (const entry of fs.readdirSync(this.options.workspaceRoot, { withFileTypes: true })) {
      if (!entry.isDirectory() || reserved.has(entry.name)) continue;
      if (!workspaces.has(entry.name)) {
        workspaces.set(entry.name, {
          workspaceId: entry.name,
          displayName: entry.name,
        });
      }
    }

    return [...workspaces.values()].sort((left, right) => left.workspaceId.localeCompare(right.workspaceId));
  }

  listServices(): Array<{ serviceId: string; displayName?: string; status: "online" | "offline" | "degraded" }> {
    return (this.options.services ?? []).map((service) => ({
      serviceId: service.serviceId,
      ...(service.displayName ? { displayName: service.displayName } : {}),
      status: "online",
    }));
  }

  private resolveService(serviceId: string): RelayConnectorServiceConfig {
    const service = (this.options.services ?? []).find((entry) => entry.serviceId === serviceId);
    if (!service) throw new Error(`Unknown relay service: ${serviceId}`);
    return service;
  }

  private serviceUrl(serviceId: string, servicePath: string): URL {
    const service = this.resolveService(serviceId);
    const base = service.baseUrl.endsWith("/") ? service.baseUrl : `${service.baseUrl}/`;
    const cleanPath = servicePath.startsWith("/") ? servicePath.slice(1) : servicePath;
    return new URL(cleanPath, base);
  }

  private async executeServiceHttp(
    payload: Record<string, unknown> | undefined,
    emitStream: (event: string, payload: Record<string, unknown>) => void,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>> {
    const serviceId = String(payload?.serviceId ?? "");
    const method = String(payload?.method ?? "GET").toUpperCase();
    const pathName = String(payload?.path ?? "/");
    const headersInput = payload?.headers && typeof payload.headers === "object" && !Array.isArray(payload.headers)
      ? payload.headers as Record<string, unknown>
      : {};
    const headers = new Headers();
    for (const [key, value] of Object.entries(headersInput)) {
      if (typeof value === "string") headers.set(key, value);
      if (Array.isArray(value)) headers.set(key, value.map(String).join(", "));
    }
    const bodyBase64 = typeof payload?.bodyBase64 === "string" ? payload.bodyBase64 : "";
    const body = bodyBase64 ? Buffer.from(bodyBase64, "base64") : undefined;
    const response = await fetch(this.serviceUrl(serviceId, pathName), {
      method,
      headers,
      ...(body && !["GET", "HEAD"].includes(method) ? { body } : {}),
      signal,
    });
    const responseHeaders = Object.fromEntries(response.headers.entries());
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("text/event-stream") && response.body) {
      emitStream("service.response", {
        status: response.status,
        headers: responseHeaders,
      });
      const reader = response.body.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value) continue;
          emitStream("service.chunk", {
            bodyBase64: Buffer.from(value).toString("base64"),
          });
        }
      } finally {
        await reader.cancel().catch(() => {});
      }
      return {
        status: response.status,
        headers: responseHeaders,
        streamed: true,
      };
    }
    const bodyBuffer = Buffer.from(await response.arrayBuffer());
    return {
      status: response.status,
      headers: responseHeaders,
      bodyBase64: bodyBuffer.toString("base64"),
    };
  }

  private async executeServiceWebSocketOpen(
    payload: Record<string, unknown> | undefined,
    emitStream: (event: string, payload: Record<string, unknown>) => void,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>> {
    const channelId = String(payload?.channelId ?? "");
    const serviceId = String(payload?.serviceId ?? "");
    const pathName = String(payload?.path ?? "/");
    const headersInput = payload?.headers && typeof payload.headers === "object" && !Array.isArray(payload.headers)
      ? payload.headers as Record<string, unknown>
      : {};
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(headersInput)) {
      if (typeof value === "string") headers[key] = value;
    }
    const url = this.serviceUrl(serviceId, pathName);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(url, { headers });
    this.serviceSockets.set(channelId, socket);
    const cleanup = () => {
      this.serviceSockets.delete(channelId);
      signal?.removeEventListener("abort", abort);
    };
    const abort = () => socket.close(1000, "relay_client_closed");
    signal?.addEventListener("abort", abort, { once: true });
    return await new Promise<Record<string, unknown>>((resolve, reject) => {
      socket.once("open", () => {
        emitStream("service.websocket.opened", { channelId });
      });
      socket.on("message", (data, isBinary) => {
        const buffer = Buffer.isBuffer(data)
          ? data
          : Array.isArray(data)
            ? Buffer.concat(data)
            : Buffer.from(data);
        emitStream("service.websocket.message", {
          channelId,
          isBinary,
          bodyBase64: buffer.toString("base64"),
        });
      });
      socket.once("close", (code, reason) => {
        cleanup();
        emitStream("service.websocket.closed", {
          channelId,
          code,
          reason: reason.toString(),
        });
        resolve({ channelId, closed: true, code });
      });
      socket.once("error", (error) => {
        cleanup();
        reject(error);
      });
    });
  }

  private executeServiceWebSocketSend(payload: Record<string, unknown> | undefined): Record<string, unknown> {
    const channelId = String(payload?.channelId ?? "");
    const socket = this.serviceSockets.get(channelId);
    if (!socket || socket.readyState !== WebSocket.OPEN) throw new Error(`Service websocket is not open: ${channelId}`);
    const body = Buffer.from(String(payload?.bodyBase64 ?? ""), "base64");
    const isBinary = payload?.isBinary === true;
    socket.send(isBinary ? body : body.toString("utf8"));
    return { channelId, sent: true };
  }

  private executeServiceWebSocketClose(payload: Record<string, unknown> | undefined): Record<string, unknown> {
    const channelId = String(payload?.channelId ?? "");
    const socket = this.serviceSockets.get(channelId);
    if (!socket) return { channelId, closed: true };
    socket.close(1000, "relay_client_closed");
    return { channelId, closed: true };
  }

  async getContext(workspaceId: string): Promise<RuntimeContext> {
    if (!this.contexts.has(workspaceId)) {
      this.contexts.set(workspaceId, this.createContext(workspaceId));
    }
    return await this.contexts.get(workspaceId)!;
  }

  private async createContext(workspaceId: string): Promise<RuntimeContext> {
    const metadata = this.resolveWorkspaceMaterialization(workspaceId);
    ensureDir(metadata.workspaceDir);

    const claw = await createClaw({
      runtime: {
        adapter: this.options.runtimeAdapter as RuntimeAdapterId,
        ...(this.runtimeBinaryPath ? { binaryPath: this.runtimeBinaryPath } : {}),
        ...(this.options.runtimeAdapter === "openclaw"
          ? {
              homeDir: process.env.OPENCLAW_STATE_DIR,
              configPath: process.env.OPENCLAW_CONFIG_PATH,
              agentDir: process.env.OPENCLAW_AGENT_DIR,
              env: this.runtimeEnv,
            }
          : { env: this.runtimeEnv }),
        ...(this.options.runtimeAdapter === "codex"
          ? {
              homeDir: process.env.CODEX_HOME,
              configPath: process.env.CODEX_CONFIG_PATH,
              authStorePath: process.env.CODEX_AUTH_STORE_PATH,
            }
          : {}),
      },
      workspace: {
        appId: "relay",
        workspaceId,
        agentId: metadata.logicalAgentId,
        logicalAgentId: metadata.logicalAgentId,
        runtimeAgentId: metadata.runtimeAgentId,
        ...(metadata.projectId ? { projectId: metadata.projectId } : {}),
        materializationVersion: metadata.materializationVersion,
        rootDir: metadata.workspaceDir,
      },
      ...(process.env.CLAWJS_TIME_URL
        ? {
            time: {
              baseUrl: process.env.CLAWJS_TIME_URL,
              token: process.env.CLAWJS_TIME_TOKEN,
            },
          }
        : {}),
      ...(process.env.CLAWJS_CONTENT_URL
        ? {
            content: {
              baseUrl: process.env.CLAWJS_CONTENT_URL,
              token: process.env.CLAWJS_CONTENT_TOKEN,
            },
          }
        : {}),
    });
    await claw.workspace.init();
    const workspaceClaw = await extendClawWithWorkspace(claw, { workspaceDir: metadata.workspaceDir });
    return {
      claw,
      workspaceClaw,
      workspaceDir: metadata.workspaceDir,
      compat: new WorkspaceCompatStore(metadata.workspaceDir),
      metadata,
    };
  }

  async getRuntimeSummary(workspaceId = "main"): Promise<RelayConnectorRuntimeSummary> {
    const { claw } = await this.getContext(workspaceId);
    return summarizeRuntimeStatus(await claw.runtime.status());
  }

  private resolveWorkspaceMaterialization(workspaceId: string): WorkspaceMaterialization {
    const registryPath = getAssignmentRegistryPath(this.options.workspaceRoot, workspaceId);
    const registered = readJsonFile<WorkspaceMaterialization>(registryPath);
    if (registered) {
      return registered;
    }
    return {
      workspaceId,
      displayName: workspaceId,
      workspaceDir: getLegacyWorkspaceDir(this.options.workspaceRoot, workspaceId),
      logicalAgentId: this.options.agentId,
      runtimeAgentId: this.options.agentId,
      materializationVersion: 1,
      legacy: true,
    };
  }

  private materializeWorkspace(workspaceId: string, payload: Record<string, unknown> | undefined): WorkspaceMaterialization {
    const projectId = typeof payload?.projectId === "string" && payload.projectId.trim() ? payload.projectId.trim() : undefined;
    const logicalAgentId = typeof payload?.logicalAgentId === "string" && payload.logicalAgentId.trim()
      ? payload.logicalAgentId.trim()
      : this.options.agentId;
    const runtimeAgentId = typeof payload?.runtimeAgentId === "string" && payload.runtimeAgentId.trim()
      ? payload.runtimeAgentId.trim()
      : logicalAgentId;
    const materializationVersion = typeof payload?.materializationVersion === "number" ? payload.materializationVersion : 1;

    if (!projectId) {
      const legacyDir = getLegacyWorkspaceDir(this.options.workspaceRoot, workspaceId);
      ensureDir(legacyDir);
      return {
        workspaceId,
        displayName: typeof payload?.displayName === "string" ? payload.displayName : workspaceId,
        workspaceDir: legacyDir,
        logicalAgentId,
        runtimeAgentId,
        materializationVersion,
        legacy: true,
      };
    }

    const projectDir = getProjectBaseDir(this.options.workspaceRoot, projectId);
    const agentTemplateDir = getAgentTemplateDir(this.options.workspaceRoot, logicalAgentId);
    const workspaceDir = getMaterializedWorkspaceDir(this.options.workspaceRoot, projectId, logicalAgentId);
    ensureDir(projectDir);
    ensureDir(agentTemplateDir);
    ensureDir(workspaceDir);

    const projectDisplayName = typeof payload?.projectDisplayName === "string" ? payload.projectDisplayName : projectId;
    const projectDescription = typeof payload?.projectDescription === "string" ? payload.projectDescription : "";
    const projectInstructions = typeof payload?.projectInstructions === "string" ? payload.projectInstructions : "";
    const agentDisplayName = typeof payload?.logicalAgentDisplayName === "string" ? payload.logicalAgentDisplayName : logicalAgentId;
    const agentRole = typeof payload?.logicalAgentRole === "string" ? payload.logicalAgentRole : "";
    const agentDescription = typeof payload?.logicalAgentDescription === "string" ? payload.logicalAgentDescription : "";
    const agentInstructions = typeof payload?.agentInstructions === "string" ? payload.agentInstructions : "";
    const assignmentDisplayName = typeof payload?.assignmentDisplayName === "string" ? payload.assignmentDisplayName : `${projectDisplayName} / ${agentDisplayName}`;
    const assignmentInstructions = typeof payload?.assignmentInstructions === "string" ? payload.assignmentInstructions : "";
    const projectResourceRefs = Array.isArray(payload?.projectResourceRefs) ? payload.projectResourceRefs as Array<Record<string, unknown>> : [];
    const projectSecretRefs = Array.isArray(payload?.projectSecretRefs) ? payload.projectSecretRefs as Array<Record<string, unknown>> : [];
    const agentResourceRefs = Array.isArray(payload?.agentResourceRefs) ? payload.agentResourceRefs as Array<Record<string, unknown>> : [];
    const agentSecretRefs = Array.isArray(payload?.agentSecretRefs) ? payload.agentSecretRefs as Array<Record<string, unknown>> : [];
    const assignmentResourceRefs = Array.isArray(payload?.assignmentResourceRefs) ? payload.assignmentResourceRefs as Array<Record<string, unknown>> : [];
    const assignmentSecretRefs = Array.isArray(payload?.assignmentSecretRefs) ? payload.assignmentSecretRefs as Array<Record<string, unknown>> : [];

    upsertManagedBlocks(path.join(projectDir, "SOUL.md"), "# Project Base", [{
      blockId: "project-context",
      content: [
        `# Project: ${projectDisplayName}`,
        "",
        ...(projectDescription ? [projectDescription, ""] : []),
        ...(projectInstructions ? ["## Instructions", "", projectInstructions] : []),
      ].join("\n").trim(),
    }]);
    upsertManagedBlocks(path.join(projectDir, "TOOLS.md"), "# Project Access", [{
      blockId: "project-access",
      content: [
        renderRefsSection("Resources", projectResourceRefs.map((ref) => ({
          id: String(ref.id ?? ""),
          label: typeof ref.label === "string" ? ref.label : undefined,
          uri: typeof ref.uri === "string" ? ref.uri : undefined,
          mode: typeof ref.mode === "string" ? ref.mode : undefined,
        }))),
        "",
        renderRefsSection("Secrets", projectSecretRefs.map((ref) => ({
          id: String(ref.id ?? ""),
          label: typeof ref.label === "string" ? ref.label : undefined,
          secretName: typeof ref.secretName === "string" ? ref.secretName : undefined,
          mode: typeof ref.mode === "string" ? ref.mode : undefined,
        }))),
      ].join("\n"),
    }]);

    upsertManagedBlocks(path.join(agentTemplateDir, "AGENTS.md"), "# Agent Template", [{
      blockId: "agent-context",
      content: [
        `# Agent: ${agentDisplayName}`,
        "",
        ...(agentRole ? [`Role: ${agentRole}`, ""] : []),
        ...(agentDescription ? [agentDescription, ""] : []),
        ...(agentInstructions ? ["## Instructions", "", agentInstructions] : []),
      ].join("\n").trim(),
    }]);
    upsertManagedBlocks(path.join(agentTemplateDir, "TOOLS.md"), "# Agent Access", [{
      blockId: "agent-access",
      content: [
        renderRefsSection("Resources", agentResourceRefs.map((ref) => ({
          id: String(ref.id ?? ""),
          label: typeof ref.label === "string" ? ref.label : undefined,
          uri: typeof ref.uri === "string" ? ref.uri : undefined,
          mode: typeof ref.mode === "string" ? ref.mode : undefined,
        }))),
        "",
        renderRefsSection("Secrets", agentSecretRefs.map((ref) => ({
          id: String(ref.id ?? ""),
          label: typeof ref.label === "string" ? ref.label : undefined,
          secretName: typeof ref.secretName === "string" ? ref.secretName : undefined,
          mode: typeof ref.mode === "string" ? ref.mode : undefined,
        }))),
      ].join("\n"),
    }]);

    upsertManagedBlocks(path.join(workspaceDir, "SOUL.md"), "# Materialized Workspace", [
      {
        blockId: "project-context",
        content: [
          `# Project: ${projectDisplayName}`,
          "",
          ...(projectDescription ? [projectDescription, ""] : []),
          ...(projectInstructions ? ["## Project Instructions", "", projectInstructions] : []),
        ].join("\n").trim(),
      },
      {
        blockId: "agent-context",
        content: [
          `# Agent: ${agentDisplayName}`,
          "",
          ...(agentRole ? [`Role: ${agentRole}`, ""] : []),
          ...(agentDescription ? [agentDescription, ""] : []),
        ].join("\n").trim(),
      },
      {
        blockId: "assignment-context",
        content: [
          `# Assignment: ${assignmentDisplayName}`,
          "",
          `- projectId: ${projectId}`,
          `- logicalAgentId: ${logicalAgentId}`,
          `- runtimeAgentId: ${runtimeAgentId}`,
          `- workspaceId: ${workspaceId}`,
          `- materializationVersion: ${materializationVersion}`,
        ].join("\n"),
      },
    ]);

    upsertManagedBlocks(path.join(workspaceDir, "AGENTS.md"), "# Materialized Instructions", [
      {
        blockId: "project-context",
        content: projectInstructions || "Project instructions are not defined.",
      },
      {
        blockId: "agent-context",
        content: agentInstructions || "Agent instructions are not defined.",
      },
      {
        blockId: "assignment-context",
        content: assignmentInstructions || "Assignment overrides are not defined.",
      },
    ]);

    upsertManagedBlocks(path.join(workspaceDir, "TOOLS.md"), "# Materialized Access", [
      {
        blockId: "project-access",
        content: [
          renderRefsSection("Project Resources", projectResourceRefs.map((ref) => ({
            id: String(ref.id ?? ""),
            label: typeof ref.label === "string" ? ref.label : undefined,
            uri: typeof ref.uri === "string" ? ref.uri : undefined,
            mode: typeof ref.mode === "string" ? ref.mode : undefined,
          }))),
          "",
          renderRefsSection("Project Secrets", projectSecretRefs.map((ref) => ({
            id: String(ref.id ?? ""),
            label: typeof ref.label === "string" ? ref.label : undefined,
            secretName: typeof ref.secretName === "string" ? ref.secretName : undefined,
            mode: typeof ref.mode === "string" ? ref.mode : undefined,
          }))),
        ].join("\n"),
      },
      {
        blockId: "agent-access",
        content: [
          renderRefsSection("Agent Resources", agentResourceRefs.map((ref) => ({
            id: String(ref.id ?? ""),
            label: typeof ref.label === "string" ? ref.label : undefined,
            uri: typeof ref.uri === "string" ? ref.uri : undefined,
            mode: typeof ref.mode === "string" ? ref.mode : undefined,
          }))),
          "",
          renderRefsSection("Agent Secrets", agentSecretRefs.map((ref) => ({
            id: String(ref.id ?? ""),
            label: typeof ref.label === "string" ? ref.label : undefined,
            secretName: typeof ref.secretName === "string" ? ref.secretName : undefined,
            mode: typeof ref.mode === "string" ? ref.mode : undefined,
          }))),
        ].join("\n"),
      },
      {
        blockId: "assignment-access",
        content: [
          renderRefsSection("Assignment Resources", assignmentResourceRefs.map((ref) => ({
            id: String(ref.id ?? ""),
            label: typeof ref.label === "string" ? ref.label : undefined,
            uri: typeof ref.uri === "string" ? ref.uri : undefined,
            mode: typeof ref.mode === "string" ? ref.mode : undefined,
          }))),
          "",
          renderRefsSection("Assignment Secrets", assignmentSecretRefs.map((ref) => ({
            id: String(ref.id ?? ""),
            label: typeof ref.label === "string" ? ref.label : undefined,
            secretName: typeof ref.secretName === "string" ? ref.secretName : undefined,
            mode: typeof ref.mode === "string" ? ref.mode : undefined,
          }))),
        ].join("\n"),
      },
    ]);

    const metadata: WorkspaceMaterialization = {
      workspaceId,
      displayName: assignmentDisplayName,
      workspaceDir,
      projectId,
      logicalAgentId,
      runtimeAgentId,
      materializationVersion,
    };
    writeJsonFile(getAssignmentRegistryPath(this.options.workspaceRoot, workspaceId), metadata);
    writeJsonFile(path.join(workspaceDir, ".relay-assignment.json"), metadata);
    return metadata;
  }

  async execute(
    operation: string,
    workspaceId: string | undefined,
    payload: Record<string, unknown> | undefined,
    emitStream: (event: string, payload: Record<string, unknown>) => void,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>> {
    const targetWorkspaceId = workspaceId ?? "main";
    if (operation === "admin.workspace.create") {
      const metadata = this.materializeWorkspace(targetWorkspaceId, payload);
      this.contexts.delete(targetWorkspaceId);
      const created = await this.getContext(targetWorkspaceId);
      return {
        ok: true,
        workspaceId: targetWorkspaceId,
        displayName: metadata.displayName,
        workspaceDir: created.workspaceDir,
        runtimeAgentId: metadata.runtimeAgentId,
        logicalAgentId: metadata.logicalAgentId,
        ...(metadata.projectId ? { projectId: metadata.projectId } : {}),
      };
    }

    if (operation === "service.http") {
      return await this.executeServiceHttp(payload, emitStream, signal);
    }
    if (operation === "service.websocket.open") {
      return await this.executeServiceWebSocketOpen(payload, emitStream, signal);
    }
    if (operation === "service.websocket.send") {
      return this.executeServiceWebSocketSend(payload);
    }
    if (operation === "service.websocket.close") {
      return this.executeServiceWebSocketClose(payload);
    }

    const { claw, workspaceClaw, compat } = await this.getContext(targetWorkspaceId);
    const metadata = this.resolveWorkspaceMaterialization(targetWorkspaceId);
    const compatRead = <T>(name: string, fallback: T[] = []) => compat.readCollection<T>(name, fallback);
    const compatWrite = <T>(name: string, entries: T[]) => compat.writeCollection(name, entries);
    const actor = this.readBrowserActor(payload?.actor);

    switch (operation) {
      case "workspace.status": {
        const runtime = await claw.runtime.status();
        const manifest = await claw.workspace.attach();
        return {
          status: {
            workspaceId: targetWorkspaceId,
            projectId: manifest?.projectId,
            logicalAgentId: manifest?.logicalAgentId,
            runtimeAgentId: manifest?.runtimeAgentId,
            runtime,
            online: true,
          },
        };
      }
      case "integrations.status": {
        const runtime = await claw.runtime.status();
        const channels = await claw.channels.list().catch(() => []);
        return { integrations: { runtime, channels } };
      }
      case "browser.session.status": {
        return {
          session: await this.browser.getSessionStatus({
            workspaceId: targetWorkspaceId,
            workspaceDir: this.resolveWorkspaceMaterialization(targetWorkspaceId).workspaceDir,
          }),
        };
      }
      case "browser.session.ensure": {
        return {
          session: await this.browser.ensureSession({
            workspaceId: targetWorkspaceId,
            workspaceDir: this.resolveWorkspaceMaterialization(targetWorkspaceId).workspaceDir,
            ...(typeof payload?.initialUrl === "string" ? { initialUrl: payload.initialUrl } : {}),
          }),
        };
      }
      case "browser.control.acquire": {
        if (!actor) throw new Error("browser actor is required");
        return {
          session: await this.browser.acquireControl({
            workspaceId: targetWorkspaceId,
            workspaceDir: this.resolveWorkspaceMaterialization(targetWorkspaceId).workspaceDir,
            actor,
          }),
        };
      }
      case "browser.control.release": {
        if (!actor) throw new Error("browser actor is required");
        return {
          session: await this.browser.releaseControl({
            workspaceId: targetWorkspaceId,
            workspaceDir: this.resolveWorkspaceMaterialization(targetWorkspaceId).workspaceDir,
            actor,
          }),
        };
      }
      case "browser.navigate": {
        if (!actor) throw new Error("browser actor is required");
        const url = typeof payload?.url === "string" ? payload.url : "";
        if (!url.trim()) throw new Error("browser url is required");
        return {
          session: await this.browser.navigate({
            workspaceId: targetWorkspaceId,
            workspaceDir: this.resolveWorkspaceMaterialization(targetWorkspaceId).workspaceDir,
            actor,
            url,
          }),
        };
      }
      case "browser.input": {
        if (!actor) throw new Error("browser actor is required");
        const command = payload?.command as BrowserInputCommand | undefined;
        if (!command || typeof command.type !== "string") {
          throw new Error("browser command is required");
        }
        return {
          session: await this.browser.dispatchInput({
            workspaceId: targetWorkspaceId,
            workspaceDir: this.resolveWorkspaceMaterialization(targetWorkspaceId).workspaceDir,
            actor,
            command,
          }),
        };
      }
      case "sessions.list":
        return { sessions: claw.sessions.listSessions() };
      case "sessions.create": {
        const title = typeof payload?.title === "string" ? payload.title : undefined;
        const message = typeof payload?.message === "string" ? payload.message : undefined;
        const session = claw.sessions.createSession(title);
        const documentIds = Array.isArray(payload?.documentIds)
          ? payload.documentIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
          : [];
        const documents = documentIds.length > 0 ? await claw.documents.resolveRefs(documentIds) : undefined;
        if (message || documents?.length) {
          claw.sessions.appendMessage(session.sessionId, {
            role: "user",
            content: message ?? "",
            ...(documents?.length ? { documents } : {}),
          });
        }
        return { session: claw.sessions.getSession(session.sessionId) };
      }
      case "sessions.get": {
        const sessionId = String(payload?.sessionId ?? "");
        return { session: claw.sessions.getSession(sessionId) };
      }
      case "sessions.update": {
        const sessionId = String(payload?.sessionId ?? "");
        const title = String(payload?.title ?? "");
        const updated = claw.sessions.updateSessionTitle(sessionId, title);
        return { ok: !!updated, title };
      }
      case "sessions.search": {
        const query = String(payload?.q ?? "");
        const limit = typeof payload?.limit === "number" ? payload.limit : undefined;
        const sessions = await claw.sessions.searchSessions({ query, limit });
        return { sessions };
      }
      case "sessions.append-message": {
        const sessionId = String(payload?.sessionId ?? "");
        const role = payload?.role === "assistant" ? "assistant" : "user";
        const content = String(payload?.content ?? "");
        const documentIds = Array.isArray(payload?.documentIds)
          ? payload.documentIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
          : [];
        const documents = documentIds.length > 0 ? await claw.documents.resolveRefs(documentIds) : undefined;
        const session = claw.sessions.appendMessage(sessionId, {
          role,
          content,
          ...(documents?.length ? { documents } : {}),
        });
        return { session };
      }
      case "sessions.generate-title": {
        const sessionId = String(payload?.sessionId ?? "");
        const title = await claw.sessions.generateTitle({ sessionId, transport: "auto" });
        return { title };
      }
      case "sessions.reply": {
        const sessionId = String(payload?.sessionId ?? "");
        const message = typeof payload?.message === "string" ? payload.message : undefined;
        const documentIds = Array.isArray(payload?.documentIds)
          ? payload.documentIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
          : [];
        const documents = documentIds.length > 0 ? await claw.documents.resolveRefs(documentIds) : undefined;
        if (message || documents?.length) {
          claw.sessions.appendMessage(sessionId, {
            role: "user",
            content: message ?? "",
            ...(documents?.length ? { documents } : {}),
          });
        }
        let reply = "";
        for await (const chunk of claw.sessions.streamAssistantReply({
          sessionId,
          ...(typeof payload?.systemPrompt === "string" ? { systemPrompt: payload.systemPrompt } : {}),
          ...(typeof payload?.transport === "string" ? { transport: payload.transport as "auto" | "cli" | "gateway" } : {}),
          signal,
        })) {
          if (!chunk.done) reply += chunk.delta;
        }
        return {
          reply: reply.trim(),
          session: claw.sessions.getSession(sessionId),
        };
      }
      case "sessions.stream": {
        const sessionId = String(payload?.sessionId ?? "");
        const message = typeof payload?.message === "string" ? payload.message : undefined;
        const documentIds = Array.isArray(payload?.documentIds)
          ? payload.documentIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
          : [];
        const documents = documentIds.length > 0 ? await claw.documents.resolveRefs(documentIds) : undefined;
        if (message || documents?.length) {
          claw.sessions.appendMessage(sessionId, {
            role: "user",
            content: message ?? "",
            ...(documents?.length ? { documents } : {}),
          });
        }
        for await (const event of claw.sessions.streamAssistantReplyEvents({
          sessionId,
          ...(typeof payload?.systemPrompt === "string" ? { systemPrompt: payload.systemPrompt } : {}),
          ...(typeof payload?.transport === "string" ? { transport: payload.transport as "auto" | "cli" | "gateway" } : {}),
          signal,
        })) {
          emitStream(
            event.type,
            event.type === "error"
              ? { ...event, error: event.error.message }
              : event as unknown as Record<string, unknown>,
          );
        }
        return {
          ok: true,
          session: claw.sessions.getSession(sessionId),
        };
      }
      case "documents.list": {
        const sessionId = typeof payload?.sessionId === "string" ? payload.sessionId : undefined;
        return { documents: await claw.documents.list({ ...(sessionId ? { sessionId } : {}) }) };
      }
      case "documents.get": {
        const documentId = String(payload?.documentId ?? "");
        return { document: await claw.documents.get(documentId) };
      }
      case "documents.search": {
        const query = String(payload?.q ?? payload?.query ?? "");
        const limit = typeof payload?.limit === "number" ? payload.limit : undefined;
        const sessionId = typeof payload?.sessionId === "string" ? payload.sessionId : undefined;
        return { documents: await claw.documents.search({ query, limit, ...(sessionId ? { sessionId } : {}) }) };
      }
      case "documents.register": {
        const filePath = String(payload?.filePath ?? "");
        const name = typeof payload?.name === "string" ? payload.name : undefined;
        const mimeType = typeof payload?.mimeType === "string" ? payload.mimeType : undefined;
        const origin = typeof payload?.origin === "string" ? payload.origin : undefined;
        const sessionId = typeof payload?.sessionId === "string" ? payload.sessionId : undefined;
        return {
          document: await claw.documents.register({
            filePath,
            ...(name ? { name } : {}),
            ...(mimeType ? { mimeType } : {}),
            ...(origin ? { origin: origin as "user_upload" | "assistant_generated" | "channel_ingested" | "imported" } : {}),
            ...(sessionId ? { sessionId } : {}),
          }),
        };
      }
      case "documents.upload.begin": {
        const name = String(payload?.name ?? "document");
        const mimeType = String(payload?.mimeType ?? "application/octet-stream");
        const origin = typeof payload?.origin === "string" ? payload.origin : undefined;
        const sessionId = typeof payload?.sessionId === "string" ? payload.sessionId : undefined;
        return await claw.documents.beginUpload({
          name,
          mimeType,
          ...(origin ? { origin: origin as "user_upload" | "assistant_generated" | "channel_ingested" | "imported" } : {}),
          ...(sessionId ? { sessionId } : {}),
        });
      }
      case "documents.upload.chunk": {
        const uploadId = String(payload?.uploadId ?? "");
        const chunk = String(payload?.chunk ?? "");
        return await claw.documents.appendUploadChunk(uploadId, chunk);
      }
      case "documents.upload.commit": {
        const uploadId = String(payload?.uploadId ?? "");
        return { document: await claw.documents.commitUpload(uploadId) };
      }
      case "documents.download": {
        const documentId = String(payload?.documentId ?? "");
        const download = await claw.documents.download(documentId);
        if (!download) {
          return { document: null };
        }
        return {
          document: download.document,
          contentBase64: download.buffer.toString("base64"),
        };
      }
      case "sessions.delete-all": {
        const metadata = this.resolveWorkspaceMaterialization(targetWorkspaceId);
        const sessionsDir = path.join(metadata.workspaceDir, ".clawjs", "sessions");
        let deleted = 0;
        if (fs.existsSync(sessionsDir)) {
          for (const entry of fs.readdirSync(sessionsDir)) {
            try {
              fs.rmSync(path.join(sessionsDir, entry), { recursive: true, force: true });
              deleted += 1;
            } catch {}
          }
        }
        this.contexts.delete(targetWorkspaceId);
        return { ok: true, deleted };
      }
      case "workspace.delete": {
        const metadata = this.resolveWorkspaceMaterialization(targetWorkspaceId);
        this.contexts.delete(targetWorkspaceId);
        if (fs.existsSync(metadata.workspaceDir)) {
          fs.rmSync(metadata.workspaceDir, { recursive: true, force: true });
        }
        const registryPath = getAssignmentRegistryPath(this.options.workspaceRoot, targetWorkspaceId);
        if (fs.existsSync(registryPath)) fs.rmSync(registryPath, { force: true });
        return { ok: true, workspaceId: targetWorkspaceId };
      }
      case "chat.feedback":
        return { ok: true };
      case "tasks.list":
        return { tasks: await workspaceClaw.tasks.list() };
      case "tasks.create":
        return { task: await workspaceClaw.tasks.create(payload as Record<string, unknown>) };
      case "tasks.update": {
        const id = String(payload?.id ?? "");
        return { task: await workspaceClaw.tasks.update(id, payload as Record<string, unknown>) };
      }
      case "tasks.delete": {
        const id = String(payload?.id ?? "");
        await workspaceClaw.tasks.remove(id);
        return { ok: true };
      }
      case "goals.list":
        return { goals: await workspaceClaw.goals.list() };
      case "goals.create":
        return { goal: await workspaceClaw.goals.create(payload as Record<string, unknown>) };
      case "goals.update": {
        const id = String(payload?.id ?? "");
        return { goal: await workspaceClaw.goals.update(id, payload as Record<string, unknown>) };
      }
      case "goals.delete": {
        const id = String(payload?.id ?? "");
        await workspaceClaw.goals.remove(id);
        return { ok: true };
      }
      case "projects.list":
        return { projects: await workspaceClaw.projects.list() };
      case "projects.create":
        return { project: await workspaceClaw.projects.create(payload as Record<string, unknown>) };
      case "projects.update": {
        const id = String(payload?.id ?? "");
        return { project: await workspaceClaw.projects.update(id, payload as Record<string, unknown>) };
      }
      case "projects.delete": {
        const id = String(payload?.id ?? "");
        await workspaceClaw.projects.remove(id);
        return { ok: true };
      }
      case "notes.list":
        return { notes: await workspaceClaw.notes.list() };
      case "notes.create":
        return { note: await workspaceClaw.notes.create(payload as Record<string, unknown>) };
      case "notes.update": {
        const id = String(payload?.id ?? "");
        return { note: await workspaceClaw.notes.update(id, payload as Record<string, unknown>) };
      }
      case "notes.delete": {
        const id = String(payload?.id ?? "");
        await workspaceClaw.notes.remove(id);
        return { ok: true };
      }
      case "memory.list": {
        const [notes, tasks] = await Promise.all([workspaceClaw.notes.list(), workspaceClaw.tasks.list()]);
        const entries = [
          ...notes.map((note: any) => ({
            id: note.id,
            kind: "knowledge",
            title: note.title,
            content: note.blocks?.map((block: any) => block.text).join("\n") ?? "",
            source: "notes",
            tags: note.tags ?? [],
            createdAt: toTimestamp(note.createdAt),
            updatedAt: toTimestamp(note.updatedAt),
          })),
          ...tasks.map((task: any) => ({
            id: task.id,
            kind: "index",
            title: task.title,
            content: task.description ?? "",
            source: "tasks",
            tags: task.labels ?? [],
            createdAt: toTimestamp(task.createdAt),
            updatedAt: toTimestamp(task.updatedAt),
          })),
        ];
        return { entries };
      }
      case "memory.create":
        return { entry: await workspaceClaw.notes.create({ title: payload?.title, content: payload?.content, tags: payload?.tags }) };
      case "memory.update": {
        const id = String(payload?.id ?? "");
        return { entry: await workspaceClaw.notes.update(id, { title: payload?.title, content: payload?.content, tags: payload?.tags }) };
      }
      case "memory.delete": {
        const id = String(payload?.id ?? "");
        await workspaceClaw.notes.remove(id);
        return { ok: true };
      }
      case "inbox.list":
        return {
          messages: (await workspaceClaw.inbox.list({ limit: 100 })).map((thread: any) => ({
            id: thread.id,
            channel: thread.channel,
            subject: thread.subject,
            preview: thread.preview,
            content: thread.preview,
            read: thread.status !== "unread",
            timestamp: toTimestamp(thread.latestMessageAt || thread.updatedAt),
            threadId: thread.externalThreadId ?? thread.id,
            from: thread.participantPersonIds?.[0] ?? thread.channel,
          })),
        };
      case "inbox.update": {
        const id = String(payload?.id ?? "");
        if (payload?.read === true) {
          const thread = await workspaceClaw.inbox.readThread(id);
          return { message: thread?.thread ?? null };
        }
        return { ok: true };
      }
      case "inbox.delete": {
        const id = String(payload?.id ?? "");
        await workspaceClaw.inbox.archive(id);
        return { ok: true };
      }
      case "people.list": {
        const hidden = new Set(compatRead<string>("people-hidden"));
        const people = (await workspaceClaw.people.list({ limit: 100 })).filter((person: any) => !hidden.has(person.id));
        return { people };
      }
      case "people.create":
        return { person: await workspaceClaw.people.upsert(payload as Record<string, unknown>) };
      case "people.update":
        return { person: await workspaceClaw.people.upsert(payload as Record<string, unknown>) };
      case "people.delete": {
        const hidden = new Set(compatRead<string>("people-hidden"));
        hidden.add(String(payload?.id ?? ""));
        compatWrite("people-hidden", [...hidden]);
        return { ok: true };
      }
      case "reminders.list":
        return { reminders: await workspaceClaw.reminders.list({ limit: 100 }) };
      case "reminders.create":
        return { reminder: await workspaceClaw.reminders.create(payload as Record<string, unknown>) };
      case "reminders.update": {
        const id = String(payload?.id ?? "");
        return { reminder: await workspaceClaw.reminders.update(id, payload as Record<string, unknown>) };
      }
      case "reminders.delete": {
        const id = String(payload?.id ?? "");
        await workspaceClaw.reminders.remove(id);
        return { ok: true };
      }
      case "deadlines.list":
        return { deadlines: await workspaceClaw.deadlines.list({ limit: 100 }) };
      case "deadlines.create":
        return { deadline: await workspaceClaw.deadlines.create(payload as Record<string, unknown>) };
      case "deadlines.update": {
        const id = String(payload?.id ?? "");
        return { deadline: await workspaceClaw.deadlines.update(id, payload as Record<string, unknown>) };
      }
      case "deadlines.delete": {
        const id = String(payload?.id ?? "");
        await workspaceClaw.deadlines.remove(id);
        return { ok: true };
      }
      case "events.list":
        if (claw.time.configured) {
          return await claw.time.legacyEvents();
        }
        return { events: await workspaceClaw.events.list({ limit: 100 }) };
      case "events.create":
        if (claw.time.configured) {
          const created = await claw.time.create({
            kind: "event",
            title: String(payload?.title ?? "Untitled event"),
            description: typeof payload?.description === "string" ? payload.description : undefined,
            location: typeof payload?.location === "string" ? payload.location : undefined,
            startsAt: typeof payload?.startsAt === "string" ? payload.startsAt : undefined,
            endsAt: typeof payload?.endsAt === "string" ? payload.endsAt : undefined,
            workspaceId: targetWorkspaceId,
            ...(metadata.projectId ? { projectId: metadata.projectId } : {}),
            agentId: metadata.logicalAgentId,
          });
          return { event: created.item };
        }
        return { event: await workspaceClaw.events.create(payload as Record<string, unknown>) };
      case "events.update": {
        const id = String(payload?.id ?? "");
        if (claw.time.configured) {
          const updated = await claw.time.update(id, payload as Record<string, unknown>);
          return { event: updated.item };
        }
        return { event: await workspaceClaw.events.update(id, payload as Record<string, unknown>) };
      }
      case "events.delete": {
        const id = String(payload?.id ?? "");
        if (claw.time.configured) {
          await claw.time.delete(id);
          return { ok: true };
        }
        await workspaceClaw.events.remove(id);
        return { ok: true };
      }
      case "time.list":
        return await claw.time.list({
          workspaceId: targetWorkspaceId,
          ...(metadata.projectId ? { projectId: metadata.projectId } : {}),
          agentId: metadata.logicalAgentId,
          ...(typeof payload?.kind === "string" ? { kind: payload.kind as any } : {}),
          ...(typeof payload?.status === "string" ? { status: payload.status as any } : {}),
        });
      case "time.create":
        return await claw.time.create({
          ...(payload as Record<string, unknown>),
          workspaceId: targetWorkspaceId,
          ...(metadata.projectId ? { projectId: metadata.projectId } : {}),
          agentId: metadata.logicalAgentId,
        } as Record<string, unknown>);
      case "time.update": {
        const id = String(payload?.id ?? "");
        return await claw.time.update(id, payload as Record<string, unknown>);
      }
      case "time.delete": {
        const id = String(payload?.id ?? "");
        await claw.time.delete(id);
        return { ok: true };
      }
      case "content.brands.list":
        return await claw.content.brands.list();
      case "content.brands.create":
        return await claw.content.brands.create(payload as Record<string, unknown>);
      case "content.brands.update": {
        const id = String(payload?.id ?? "");
        return await claw.content.brands.update(id, payload as Record<string, unknown>);
      }
      case "content.destinations.list":
        return await claw.content.destinations.list(typeof payload?.brandId === "string" ? { brandId: payload.brandId } : undefined);
      case "content.destinations.create":
        return await claw.content.destinations.create(payload as Record<string, unknown>);
      case "content.destinations.update": {
        const id = String(payload?.id ?? "");
        return await claw.content.destinations.update(id, payload as Record<string, unknown>);
      }
      case "content.destinations.testConnection": {
        const id = String(payload?.id ?? "");
        return await claw.content.destinations.testConnection(id);
      }
      case "content.campaigns.list":
        return await claw.content.campaigns.list(typeof payload?.brandId === "string" ? { brandId: payload.brandId } : undefined);
      case "content.campaigns.create":
        return await claw.content.campaigns.create(payload as Record<string, unknown>);
      case "content.campaigns.update": {
        const id = String(payload?.id ?? "");
        return await claw.content.campaigns.update(id, payload as Record<string, unknown>);
      }
      case "content.entries.list":
        return await claw.content.entries.list(payload as Record<string, string>);
      case "content.entries.get": {
        const id = String(payload?.id ?? "");
        return await claw.content.entries.get(id);
      }
      case "content.entries.create":
        return await claw.content.entries.create(payload as Record<string, unknown>);
      case "content.entries.update": {
        const id = String(payload?.id ?? "");
        return await claw.content.entries.update(id, payload as Record<string, unknown>);
      }
      case "content.entries.archive": {
        const id = String(payload?.id ?? "");
        return await claw.content.entries.archive(id);
      }
      case "content.entries.attachAsset": {
        const id = String(payload?.id ?? "");
        return await claw.content.entries.attachAsset(id, payload as Record<string, unknown>);
      }
      case "content.entries.generateVariants": {
        const id = String(payload?.id ?? "");
        return await claw.content.entries.generateVariants(id, {
          destinationIds: Array.isArray(payload?.destinationIds) ? payload.destinationIds.map(String) : [],
        });
      }
      case "content.variants.list":
        return await claw.content.variants.list(payload as Record<string, string>);
      case "content.variants.create":
        return await claw.content.variants.create(payload as Record<string, unknown>);
      case "content.variants.update": {
        const id = String(payload?.id ?? "");
        return await claw.content.variants.update(id, payload as Record<string, unknown>);
      }
      case "content.approvals.list":
        return await claw.content.approvals.list(payload as Record<string, string>);
      case "content.approvals.approve": {
        const id = String(payload?.id ?? "");
        return await claw.content.approvals.approve(id, payload as Record<string, unknown>);
      }
      case "content.approvals.reject": {
        const id = String(payload?.id ?? "");
        return await claw.content.approvals.reject(id, { comment: String(payload?.comment ?? "") });
      }
      case "content.approvals.cancel": {
        const id = String(payload?.id ?? "");
        return await claw.content.approvals.cancel(id);
      }
      case "content.calendar.view":
        return await claw.content.calendar.view();
      case "content.publish.listPlans":
        return await claw.content.publish.listPlans(payload as Record<string, string>);
      case "content.publish.createPlan":
        return await claw.content.publish.createPlan(payload as Record<string, unknown>);
      case "content.publish.cancelPlan": {
        const id = String(payload?.id ?? "");
        return await claw.content.publish.cancelPlan(id);
      }
      case "content.publish.runNow": {
        const id = String(payload?.id ?? "");
        return await claw.content.publish.runNow(id);
      }
      case "content.publish.schedulerRun":
        return await claw.content.publish.schedulerRun();
      case "content.publish.listRuns":
        return await claw.content.publish.listRuns();
      case "content.publish.getRun": {
        const id = String(payload?.id ?? "");
        return await claw.content.publish.getRun(id);
      }
      case "content.publish.retryRun": {
        const id = String(payload?.id ?? "");
        return await claw.content.publish.retryRun(id);
      }
      case "content.app.frontendContract":
        return await claw.content.app.frontendContract();
      case "content.app.screens":
        return await claw.content.app.screens();
      case "content.app.dashboard":
        return await claw.content.app.dashboard();
      case "content.app.calendar":
        return await claw.content.calendar.view();
      case "content.app.pipeline":
        return await claw.content.app.pipeline();
      case "content.app.composer": {
        const entryId = String(payload?.entryId ?? "");
        return await claw.content.app.composer(entryId);
      }
      case "content.app.destinations":
        return await claw.content.destinations.view();
      case "content.app.approvals":
        return await claw.content.approvals.view();
      case "content.app.publications":
        return await claw.content.publish.view();
      case "content.app.form": {
        const formId = String(payload?.formId ?? "entry.create") as "entry.create" | "variant.edit" | "destination.create" | "publish-plan.create";
        return await claw.content.app.form(formId);
      }
      case "personas.list":
        return { personas: compatRead("personas", DEFAULT_PERSONAS) };
      case "personas.create": {
        const personas = compatRead<any>("personas", DEFAULT_PERSONAS);
        const persona = { id: randomUUID(), createdAt: Date.now(), updatedAt: Date.now(), ...payload };
        personas.push(persona);
        compatWrite("personas", personas);
        return { persona };
      }
      case "personas.update": {
        const personas = compatRead<any>("personas", DEFAULT_PERSONAS);
        const id = String(payload?.id ?? "");
        const index = personas.findIndex((entry: any) => entry.id === id);
        if (index === -1) throw new Error("Persona not found");
        personas[index] = { ...personas[index], ...payload, updatedAt: Date.now() };
        compatWrite("personas", personas);
        return { persona: personas[index] };
      }
      case "personas.delete": {
        const personas = compatRead<any>("personas", DEFAULT_PERSONAS).filter((entry: any) => entry.id !== String(payload?.id ?? ""));
        compatWrite("personas", personas);
        return { ok: true };
      }
      case "plugins.list":
        return { plugins: compatRead("plugins", DEFAULT_PLUGINS) };
      case "plugins.create": {
        const plugins = compatRead<any>("plugins", DEFAULT_PLUGINS);
        const plugin = { id: randomUUID(), installedAt: Date.now(), lastActivity: Date.now(), ...payload };
        plugins.push(plugin);
        compatWrite("plugins", plugins);
        return { plugin };
      }
      case "plugins.update": {
        const plugins = compatRead<any>("plugins", DEFAULT_PLUGINS);
        const id = String(payload?.id ?? "");
        const index = plugins.findIndex((entry: any) => entry.id === id);
        if (index === -1) throw new Error("Plugin not found");
        plugins[index] = { ...plugins[index], ...payload, lastActivity: Date.now() };
        compatWrite("plugins", plugins);
        return { plugin: plugins[index] };
      }
      case "plugins.delete": {
        const plugins = compatRead<any>("plugins", DEFAULT_PLUGINS).filter((entry: any) => entry.id !== String(payload?.id ?? ""));
        compatWrite("plugins", plugins);
        return { ok: true };
      }
      case "routines.list":
        if (claw.time.configured) {
          return await claw.time.legacyRoutines();
        }
        return { routines: compatRead("routines"), executions: compatRead("routine-executions") };
      case "routines.create": {
        if (claw.time.configured) {
          const created = await claw.time.create({
            kind: "routine",
            title: String(payload?.label ?? payload?.title ?? "Routine"),
            description: typeof payload?.description === "string" ? payload.description : undefined,
            workspaceId: targetWorkspaceId,
            ...(metadata.projectId ? { projectId: metadata.projectId } : {}),
            agentId: metadata.logicalAgentId,
            ...(typeof payload?.schedule === "string"
              ? { schedule: { mode: "cron", timezone: "UTC", cron: payload.schedule } }
              : {}),
          });
          return { routine: created.item };
        }
        const routines = compatRead<any>("routines");
        const routine = { id: randomUUID(), enabled: true, createdAt: Date.now(), updatedAt: Date.now(), ...payload };
        routines.push(routine);
        compatWrite("routines", routines);
        return { routine };
      }
      case "routines.update": {
        if (claw.time.configured) {
          const id = String(payload?.id ?? "");
          if (payload?.runNow) {
            return await claw.time.runNow(id);
          }
          const updated = await claw.time.update(id, payload as Record<string, unknown>);
          return { routine: updated.item };
        }
        const routines = compatRead<any>("routines");
        const executions = compatRead<any>("routine-executions");
        const id = String(payload?.id ?? "");
        const index = routines.findIndex((entry: any) => entry.id === id);
        if (index === -1) throw new Error("Routine not found");
        if (payload?.runNow) {
          const execution = {
            id: randomUUID(),
            routineId: id,
            status: "success",
            startedAt: Date.now(),
            completedAt: Date.now(),
            output: "Routine executed by relay connector.",
          };
          executions.push(execution);
          compatWrite("routine-executions", executions);
          return { routine: routines[index], execution };
        }
        routines[index] = { ...routines[index], ...payload, updatedAt: Date.now() };
        compatWrite("routines", routines);
        return { routine: routines[index] };
      }
      case "routines.delete": {
        const id = String(payload?.id ?? "");
        if (claw.time.configured) {
          await claw.time.delete(id);
          return { ok: true };
        }
        compatWrite("routines", compatRead<any>("routines").filter((entry: any) => entry.id !== id));
        compatWrite("routine-executions", compatRead<any>("routine-executions").filter((entry: any) => entry.routineId !== id));
        return { ok: true };
      }
      case "skills.list":
        return { skills: await claw.skills.list() };
      case "skills.search":
        return { results: await claw.skills.search(String(payload?.q ?? ""), { limit: Number(payload?.limit ?? 10) }) };
      case "skills.sources":
        return { sources: await claw.skills.sources() };
      case "images.list":
        return { images: claw.image.list(payload as Record<string, unknown>) };
      case "images.get":
        return { image: claw.image.get(String(payload?.imageId ?? "")) };
      case "images.create":
        return { image: await claw.image.generate(payload as Record<string, unknown>) };
      case "images.delete":
        return { removed: claw.image.remove(String(payload?.imageId ?? "")) };
      case "admin.runtime.status":
        return { runtime: await claw.runtime.status() };
      case "admin.runtime.setup":
        await claw.runtime.setupWorkspace();
        return { ok: true };
      case "admin.runtime.install":
        await claw.runtime.install("npm");
        return { ok: true };
      case "admin.runtime.uninstall":
        await claw.runtime.uninstall("npm");
        return { ok: true };
      case "admin.config.read":
        return { values: claw.files.readSettingsValues() };
      case "admin.config.write":
        claw.files.writeSettingsValues((payload?.values ?? {}) as Record<string, unknown>);
        return { ok: true };
      case "admin.workspace-file.read":
        return { file: claw.files.readWorkspaceFile(String(payload?.fileName ?? "")) };
      case "admin.workspace-file.write":
        claw.files.writeWorkspaceFile(String(payload?.fileName ?? ""), String(payload?.content ?? ""));
        return { ok: true };
      default:
        throw new Error(`Unsupported relay operation: ${operation}`);
    }
  }

  private readBrowserActor(input: unknown): BrowserActor | null {
    if (!input || typeof input !== "object") return null;
    const actor = input as Record<string, unknown>;
    if (typeof actor.deviceId !== "string" || typeof actor.userId !== "string") {
      return null;
    }
    return {
      deviceId: actor.deviceId,
      userId: actor.userId,
      ...(typeof actor.email === "string" ? { email: actor.email } : {}),
    };
  }
}
