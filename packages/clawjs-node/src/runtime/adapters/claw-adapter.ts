import fs from "fs";
import path from "path";

import type {
  AuthDiagnostics,
  AuthLoginResult,
  CommandRunner,
  RuntimeAdapter,
  RuntimeAdapterOptions,
  RuntimeCompatReport,
  RuntimeProgressPlan,
  RuntimeProgressSink,
  RuntimeProbeStatus,
  RuntimeSetupInput,
  SaveApiKeyResult,
} from "../contracts.ts";
import type {
  AuthState,
  ChannelDescriptor,
  MemoryDescriptor,
  ModelCatalog,
  ProviderCatalog,
  RuntimeCapabilityMap,
  SchedulerDescriptor,
  SkillDescriptor,
} from "@clawjs/core";

import {
  CLAW_RUNTIME_PROVIDERS,
  CLAW_RUNTIME_WORKSPACE_FILES,
  getClawRuntimeDefaultModel,
  getClawRuntimeProviderAuth,
  listClawRuntimeModels,
  listClawRuntimeProviders,
  resolveClawRuntimeConfig,
  resolveClawRuntimeLocations,
} from "../claw-runtime.ts";
import {
  buildProgressStep,
  buildRuntimeCapabilityMap,
  buildRuntimeCompatReport,
  capabilityBooleansFromMap,
  defaultManagedSessionFeatures,
  runtimeOperationCapability,
} from "./shared.ts";

function buildCapabilityMap(options: RuntimeAdapterOptions): RuntimeCapabilityMap {
  const resolved = resolveClawRuntimeConfig(options);
  const authReady = resolved.authSource === "secrets" || resolved.authSource === "env";
  return buildRuntimeCapabilityMap({
    runtime: { supported: true, status: "ready", strategy: "native" },
    workspace: { supported: true, status: "ready", strategy: "native" },
    auth: {
      supported: true,
      status: authReady ? "ready" : "degraded",
      strategy: resolved.authSource === "secrets" ? "config" : "config",
      diagnostics: { source: "config", provider: resolved.provider.id, authSource: resolved.authSource },
      limitations: authReady ? undefined : ["Configure a Secrets secret reference or provider environment key before real model calls."],
    },
    models: { supported: true, status: "ready", strategy: "config", diagnostics: { source: "config", inventoryFreshness: "static" } },
    session_cli: { supported: false, status: "unsupported", strategy: "unsupported" },
    session_gateway: {
      supported: true,
      status: authReady ? "ready" : "degraded",
      strategy: "gateway",
      diagnostics: { source: "config", probeMethod: "config", transport: "gateway", wire: resolved.wire },
    },
    streaming: { supported: true, status: authReady ? "ready" : "degraded", strategy: "gateway" },
    memory: { supported: true, status: "degraded", strategy: "derived", limitations: ["V1 memory is workspace-file based."] },
    skills: { supported: true, status: "degraded", strategy: "derived", limitations: ["V1 skill inventory is workspace-file based."] },
    channels: { supported: false, status: "unsupported", strategy: "unsupported" },
    scheduler: { supported: false, status: "unsupported", strategy: "unsupported" },
    sandbox: {
      supported: true,
      status: resolved.permissionMode === "read-only" ? "ready" : "degraded",
      strategy: "native",
      limitations: ["V1 enforces workspace path boundaries and permission mode, not a full OS sandbox."],
    },
    plugins: { supported: false, status: "unsupported", strategy: "unsupported" },
    doctor: { supported: true, status: "ready", strategy: "native" },
    compat: { supported: true, status: "ready", strategy: "native" },
    configuration: { supported: true, status: "ready", strategy: "config" },
  });
}

function buildNoopProgressPlan(operation: "install" | "uninstall" | "repair" | "setup", input?: RuntimeSetupInput): RuntimeProgressPlan {
  return {
    operation,
    capability: runtimeOperationCapability(operation),
    steps: [
      buildProgressStep(`claw.${operation}.prepare`, operation === "setup" ? `Prepare Claw Runtime workspace for ${input?.agentId ?? "workspace"}.` : `Prepare Claw Runtime ${operation}.`, 20),
      buildProgressStep(`claw.${operation}.finalize`, "Claw Runtime is built into ClawJS.", 100),
    ],
  };
}

function emitNoopProgress(plan: RuntimeProgressPlan, onProgress?: RuntimeProgressSink): void {
  for (const step of plan.steps) {
    onProgress?.({
      operation: plan.operation,
      capability: plan.capability,
      phase: step.phase,
      message: step.message,
      percent: step.percent,
      status: "complete",
      timestamp: new Date().toISOString(),
    });
  }
}

export const clawAdapter: RuntimeAdapter = {
  id: "claw",
  runtimeName: "Claw Runtime",
  stability: "stable",
  supportLevel: "dev-only",
  workspaceFiles: CLAW_RUNTIME_WORKSPACE_FILES,
  describeFeatures() {
    return defaultManagedSessionFeatures({
      channelsSupported: false,
      skillsSupported: true,
      pluginsSupported: false,
      memorySupported: true,
      schedulerSupported: false,
      limitationsByFeature: {
        runtime: ["V1 is headless and exposes a JSON-RPC app-server subset."],
        sessions: ["V1 supports provider-backed streaming sessions and basic workspace tools."],
      },
    });
  },
  resolveLocations(options) {
    return resolveClawRuntimeLocations(options);
  },
  getWorkspaceContract() {
    return { files: CLAW_RUNTIME_WORKSPACE_FILES };
  },
  async getStatus(_runner: CommandRunner, options = { adapter: "claw" }): Promise<RuntimeProbeStatus> {
    const resolved = resolveClawRuntimeConfig(options);
    const capabilityMap = buildCapabilityMap(options);
    return {
      adapter: "claw",
      runtimeName: "Claw Runtime",
      version: "0.1.0",
      installed: true,
      cliAvailable: true,
      gatewayAvailable: true,
      capabilities: capabilityBooleansFromMap(capabilityMap),
      capabilityMap,
      diagnostics: {
        provider: resolved.provider.id,
        model: resolved.model,
        wire: resolved.wire,
        authSource: resolved.authSource,
        locations: resolved.locations,
      },
    };
  },
  buildCompatReport(status): RuntimeCompatReport {
    const issues = status.capabilityMap.auth.status === "ready"
      ? []
      : ["Claw Runtime provider auth is not configured."];
    return buildRuntimeCompatReport({
      runtimeAdapter: "claw",
      runtimeVersion: status.version,
      capabilityMap: status.capabilityMap,
      degraded: issues.length > 0,
      issues,
      diagnostics: status.diagnostics,
    });
  },
  buildDoctorReport(status) {
    const compat = this.buildCompatReport(status);
    return {
      ok: compat.issues.length === 0,
      runtime: status,
      compat,
      issues: compat.issues,
      suggestedRepairs: compat.issues.length > 0
        ? ["Configure a provider Secrets secret reference or the provider environment key."]
        : [],
    };
  },
  buildInstallCommand() {
    return { command: process.execPath, args: ["-e", "process.stdout.write('claw-runtime built-in')"] };
  },
  buildUninstallCommand() {
    return { command: process.execPath, args: ["-e", "process.stdout.write('claw-runtime built-in')"] };
  },
  buildRepairCommand() {
    return { command: process.execPath, args: ["-e", "process.stdout.write('claw-runtime doctor')"] };
  },
  buildWorkspaceSetupCommand(input) {
    return { command: process.execPath, args: ["-e", `process.stdout.write(${JSON.stringify(input.workspaceDir)})`] };
  },
  buildProgressPlan(operation, input) {
    return buildNoopProgressPlan(operation, input);
  },
  async install(_runner, _installer, onProgress) {
    emitNoopProgress(buildNoopProgressPlan("install"), onProgress);
  },
  async uninstall(_runner, _installer, onProgress) {
    emitNoopProgress(buildNoopProgressPlan("uninstall"), onProgress);
  },
  async repair(_runner, onProgress) {
    emitNoopProgress(buildNoopProgressPlan("repair"), onProgress);
  },
  async setupWorkspace(input, _runner, onProgress) {
    fs.mkdirSync(input.workspaceDir, { recursive: true });
    emitNoopProgress(buildNoopProgressPlan("setup", input), onProgress);
  },
  async getProviderCatalog(): Promise<ProviderCatalog> {
    return { providers: listClawRuntimeProviders() };
  },
  async listProviders() {
    return listClawRuntimeProviders();
  },
  async getModelCatalog(_runner, options): Promise<ModelCatalog> {
    return {
      models: listClawRuntimeModels(options),
      defaultModel: getClawRuntimeDefaultModel(options),
    };
  },
  async listModels(_runner, options) {
    return listClawRuntimeModels(options);
  },
  async getDefaultModel(_runner, options) {
    return getClawRuntimeDefaultModel(options);
  },
  async setDefaultModel(model, _runner, options) {
    const locations = resolveClawRuntimeLocations(options);
    fs.mkdirSync(path.dirname(locations.configPath), { recursive: true });
    const current = (() => {
      try { return JSON.parse(fs.readFileSync(locations.configPath, "utf8")) as Record<string, unknown>; } catch { return {}; }
    })();
    fs.writeFileSync(locations.configPath, `${JSON.stringify({ ...current, model }, null, 2)}\n`);
    return model;
  },
  async getAuthState(_runner, options): Promise<AuthState> {
    return {
      providers: getClawRuntimeProviderAuth(options),
      diagnostics: { providers: CLAW_RUNTIME_PROVIDERS.map((provider) => provider.id) },
    };
  },
  async getProviderAuth(_runner, options) {
    return getClawRuntimeProviderAuth(options);
  },
  async prepareLogin() {
    return null;
  },
  async login(provider): Promise<AuthLoginResult> {
    return {
      requestedProvider: provider,
      provider,
      status: "reused",
      launchMode: "none",
      message: "Claw Runtime uses Secrets secret references or environment keys.",
    };
  },
  diagnostics(provider, options): AuthDiagnostics {
    const resolved = resolveClawRuntimeConfig(options);
    return {
      provider: provider ?? resolved.provider.id,
      authStorePath: resolved.provider.secretRef ? `secrets:${resolved.provider.secretRef}` : undefined,
      profiles: [],
      issues: resolved.authSource === "missing" ? [`Missing ${resolved.provider.envKey}.`] : [],
      authSource: resolved.authSource,
    };
  },
  setApiKey(): never {
    throw new Error("Claw Runtime does not persist literal API keys. Use Secrets secret references or environment keys.");
  },
  async saveApiKey(): Promise<SaveApiKeyResult> {
    throw new Error("Claw Runtime does not persist literal API keys. Use Secrets secret references or environment keys.");
  },
  removeProvider() {
    return 0;
  },
  async listSchedulers(): Promise<SchedulerDescriptor[]> {
    return [];
  },
  async runScheduler(): Promise<void> {},
  async setSchedulerEnabled(): Promise<void> {},
  async listMemory(_runner, options): Promise<MemoryDescriptor[]> {
    const locations = resolveClawRuntimeLocations(options);
    return [{ id: "claw-runtime-memory", label: "Claw Runtime Memory", kind: "knowledge", path: path.join(locations.workspacePath, "MEMORY.md") }];
  },
  async searchMemory(query, runner, options) {
    return (await this.listMemory(runner, options)).filter((entry) => `${entry.label} ${entry.path ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  },
  async listSkills(_runner, options): Promise<SkillDescriptor[]> {
    const locations = resolveClawRuntimeLocations(options);
    return [{ id: "workspace-tools", label: "Workspace Tools", enabled: true, scope: "workspace", path: path.join(locations.workspacePath, "TOOLS.md") }];
  },
  async syncSkills(runner, options) {
    return this.listSkills(runner, options);
  },
  async listChannels(): Promise<ChannelDescriptor[]> {
    return [];
  },
  createSessionAdapter(options) {
    const resolved = resolveClawRuntimeConfig(options);
    const gateway = {
      kind: "claw-runtime" as const,
      url: resolved.provider.baseUrl,
      model: resolved.model,
      provider: resolved.provider.id,
      wire: resolved.wire,
      headers: resolved.provider.headers,
      secretRef: resolved.provider.secretRef,
      envKey: resolved.provider.envKey,
      permissionMode: resolved.permissionMode,
      env: options.env,
    };
    const fallbackWire = resolved.wire === "responses" ? "chat_completions" : "responses";
    return {
      transport: {
        kind: "hybrid",
        streaming: true,
        gatewayKind: "claw-runtime",
        primaryTransport: "gateway",
        fallbackTransport: "gateway",
        sessionPersistence: "workspace",
        streamingMode: "gateway",
      },
      gateway,
      fallbackGateway: { ...gateway, wire: fallbackWire },
      primaryTransport: "gateway",
      fallbackTransport: "gateway",
      sessionPersistence: "workspace",
      streamingMode: "gateway",
      sessionPath: path.join(resolved.locations.homeDir, "sessions"),
      buildCliInvocation() {
        throw new Error("Claw Runtime V1 is gateway-native and has no CLI fallback.");
      },
      supportsGateway: true,
    };
  },
};
