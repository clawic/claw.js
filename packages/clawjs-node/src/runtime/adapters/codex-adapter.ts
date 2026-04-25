import fs from "fs";
import os from "os";
import path from "path";

import type {
  AuthDiagnostics,
  AuthLoginPlan,
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
  MemoryDescriptor,
  ModelCatalog,
  ModelDescriptor,
  ProviderAuthSummary,
  ProviderCatalog,
  ProviderDescriptor,
  RuntimeCapabilityMap,
  RuntimeFileDescriptor,
  RuntimeLocations,
  SkillDescriptor,
} from "@clawjs/core";

import { NodeProcessHost } from "../../host/process.ts";
import { buildCodexCommand, withCodexCommandEnv } from "../codex-command.ts";
import {
  buildProgressStep,
  buildRuntimeCapabilityMap,
  buildRuntimeCompatReport,
  defaultManagedSessionFeatures,
  runRuntimeProgressPlan,
  runtimeOperationCapability,
} from "./shared.ts";

const CODEX_WORKSPACE_FILES: RuntimeFileDescriptor[] = [
  { key: "AGENTS", path: "AGENTS.md", required: true, visibleToUser: true, seedPolicy: "seed_if_missing" },
];

const CODEX_PROVIDER: ProviderDescriptor = {
  id: "openai-codex",
  label: "Codex",
  auth: {
    supportsOAuth: true,
    supportsApiKey: false,
    supportsEnv: false,
    supportsToken: false,
  },
};

const CODEX_MODELS: ModelDescriptor[] = [
  { id: "gpt-5.4", modelId: "gpt-5.4", provider: "openai-codex", label: "GPT-5.4", available: true, source: "runtime" },
  { id: "gpt-5.3-codex", modelId: "gpt-5.3-codex", provider: "openai-codex", label: "GPT-5.3 Codex", available: true, source: "runtime" },
  { id: "gpt-5.2-codex", modelId: "gpt-5.2-codex", provider: "openai-codex", label: "GPT-5.2 Codex", available: true, source: "runtime" },
];

interface CodexProbeDetails {
  cliAvailable: boolean;
  version: string | null;
  loginStatusAvailable: boolean;
  loggedIn: boolean;
  appServerAvailable: boolean;
  diagnostics: Record<string, unknown>;
}

function resolveCodexHome(options: RuntimeAdapterOptions): string {
  return options.homeDir?.trim()
    || options.env?.CODEX_HOME?.trim()
    || process.env.CODEX_HOME?.trim()
    || path.join(os.homedir(), ".codex");
}

function resolveCodexLocations(options: RuntimeAdapterOptions): RuntimeLocations {
  const homeDir = resolveCodexHome(options);
  return {
    homeDir,
    configPath: options.configPath?.trim() || path.join(homeDir, "config.toml"),
    workspacePath: options.workspacePath?.trim(),
    authStorePath: options.authStorePath?.trim() || path.join(homeDir, "auth.json"),
  };
}

function readCodexDefaultModel(options: RuntimeAdapterOptions): string | null {
  const configPath = resolveCodexLocations(options).configPath;
  if (!configPath) return null;
  try {
    const config = fs.readFileSync(configPath, "utf8");
    const match = config.match(/(?:^|\n)\s*model\s*=\s*["']([^"']+)["']/);
    return match?.[1]?.trim() || null;
  } catch {
    return null;
  }
}

function writeCodexDefaultModel(model: string, options: RuntimeAdapterOptions): void {
  const configPath = resolveCodexLocations(options).configPath;
  if (!configPath) return;
  let config = "";
  try {
    config = fs.readFileSync(configPath, "utf8");
  } catch {}
  const next = /(?:^|\n)\s*model\s*=\s*["'][^"']+["']/.test(config)
    ? config.replace(/(^|\n)(\s*)model\s*=\s*["'][^"']+["']/, `$1$2model = "${model}"`)
    : `${config.trim() ? `${config.trimEnd()}\n` : ""}model = "${model}"\n`;
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, next);
}

function normalizeCodexVersion(stdout: string): string | null {
  const trimmed = stdout.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/(?:codex(?:-cli)?\s+)?([0-9]+(?:\.[0-9A-Za-z.-]+)+)/);
  return match?.[1] ?? trimmed;
}

function isLoggedIn(stdout: string): boolean {
  return /logged in|authenticated|signed in/i.test(stdout);
}

function codexAuthSummary(loggedIn: boolean): ProviderAuthSummary {
  return {
    provider: CODEX_PROVIDER.id,
    hasAuth: loggedIn,
    hasSubscription: loggedIn,
    hasApiKey: false,
    hasProfileApiKey: false,
    hasEnvKey: false,
    authType: loggedIn ? "oauth" : null,
  };
}

function buildCapabilityMap(details: CodexProbeDetails): RuntimeCapabilityMap {
  return buildRuntimeCapabilityMap({
    runtime: { supported: true, status: details.cliAvailable ? "ready" : "error", strategy: "cli" },
    workspace: { supported: true, status: "ready", strategy: "native" },
    auth: { supported: true, status: details.loggedIn ? "ready" : details.loginStatusAvailable ? "degraded" : "error", strategy: "cli" },
    models: { supported: true, status: details.loggedIn ? "ready" : "degraded", strategy: "config" },
    session_cli: { supported: true, status: details.cliAvailable ? "ready" : "error", strategy: "cli" },
    session_gateway: {
      supported: true,
      status: details.appServerAvailable ? "ready" : "degraded",
      strategy: "gateway",
      diagnostics: { source: "runtime", probeMethod: "cli", transport: "gateway", inventoryFreshness: "live" },
    },
    streaming: { supported: true, status: details.appServerAvailable ? "ready" : "degraded", strategy: details.appServerAvailable ? "gateway" : "cli" },
    memory: {
      supported: true,
      status: "degraded",
      strategy: "derived",
      limitations: ["Codex memory is inferred from Codex home and workspace instruction files."],
    },
    skills: {
      supported: true,
      status: "degraded",
      strategy: "derived",
      limitations: ["Skills inventory is derived from the Codex home and workspace directories."],
    },
    channels: { supported: false, status: "unsupported", strategy: "unsupported" },
    scheduler: { supported: false, status: "unsupported", strategy: "unsupported" },
    sandbox: {
      supported: true,
      status: "ready",
      strategy: "native",
      limitations: ["Sandbox behavior follows the selected Codex CLI profile and command flags."],
    },
    plugins: { supported: true, status: details.cliAvailable ? "ready" : "degraded", strategy: "cli" },
    doctor: { supported: true, status: "ready", strategy: "derived" },
    compat: { supported: true, status: "ready", strategy: "native" },
  });
}

async function probeCodex(runner: CommandRunner, options: RuntimeAdapterOptions): Promise<CodexProbeDetails> {
  const diagnostics: Record<string, unknown> = {
    locations: resolveCodexLocations(options),
  };
  let cliAvailable = false;
  let version: string | null = null;
  try {
    const command = buildCodexCommand(["--version"], options);
    const result = await runner.exec(command.command, command.args, { env: command.env, timeoutMs: 8_000 });
    cliAvailable = true;
    version = normalizeCodexVersion(result.stdout);
  } catch (error) {
    diagnostics.lastError = error instanceof Error ? error.message : String(error);
  }

  let loginStatusAvailable = false;
  let loggedIn = false;
  let appServerAvailable = false;
  if (cliAvailable) {
    try {
      const command = buildCodexCommand(["login", "status"], options);
      const result = await runner.exec(command.command, command.args, { env: command.env, timeoutMs: 8_000 });
      loginStatusAvailable = true;
      loggedIn = isLoggedIn(`${result.stdout}\n${result.stderr}`);
    } catch (error) {
      diagnostics.authError = error instanceof Error ? error.message : String(error);
    }

    try {
      const command = buildCodexCommand(["app-server", "--help"], options);
      await runner.exec(command.command, command.args, { env: command.env, timeoutMs: 8_000 });
      appServerAvailable = true;
    } catch (error) {
      diagnostics.appServerError = error instanceof Error ? error.message : String(error);
    }
  }

  return {
    cliAvailable,
    version,
    loginStatusAvailable,
    loggedIn,
    appServerAvailable,
    diagnostics,
  };
}

function listCodexSkills(options: RuntimeAdapterOptions): SkillDescriptor[] {
  const locations = resolveCodexLocations(options);
  const skillDirs = [
    locations.homeDir ? path.join(locations.homeDir, "skills") : null,
    locations.workspacePath ? path.join(locations.workspacePath, "skills") : null,
  ].filter((entry): entry is string => !!entry);

  const skills: SkillDescriptor[] = [];
  for (const skillsDir of skillDirs) {
    try {
      for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
        if (!entry.isDirectory() && !entry.isFile()) continue;
        const id = entry.name.replace(/\.[^.]+$/, "");
        skills.push({
          id,
          label: id.split(/[._-]+/).filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ") || id,
          enabled: true,
          scope: skillsDir.includes(`${path.sep}.codex${path.sep}`) ? "global" : "workspace",
          path: path.join(skillsDir, entry.name),
        });
      }
    } catch {}
  }
  return skills.sort((left, right) => left.id.localeCompare(right.id));
}

function buildNoopProgressPlan(operation: "setup", input: RuntimeSetupInput): RuntimeProgressPlan {
  return {
    operation,
    capability: runtimeOperationCapability(operation),
    steps: [
      buildProgressStep("workspace.setup.prepare", `Prepare Codex workspace instructions for ${input.agentId}.`, 20),
      buildProgressStep("workspace.setup.finalize", "Codex uses AGENTS.md and the selected working directory directly.", 100),
    ],
  };
}

export const codexAdapter: RuntimeAdapter = {
  id: "codex",
  runtimeName: "Codex",
  stability: "experimental",
  supportLevel: "experimental",
  workspaceFiles: CODEX_WORKSPACE_FILES,
  describeFeatures() {
    return defaultManagedSessionFeatures({
      skillsSupported: true,
      pluginsSupported: true,
      memorySupported: true,
      schedulerSupported: false,
      channelsSupported: false,
      limitationsByFeature: {
        channels: ["Codex does not expose ClawJS channel inventory."],
        scheduler: ["Codex automation is not mapped into ClawJS schedulers yet."],
      },
    });
  },
  resolveLocations(options) {
    return resolveCodexLocations(options);
  },
  getWorkspaceContract() {
    return { files: CODEX_WORKSPACE_FILES };
  },
  async getStatus(runner = new NodeProcessHost(), options = { adapter: "codex" }): Promise<RuntimeProbeStatus> {
    const details = await probeCodex(runner, options);
    const capabilityMap = buildCapabilityMap(details);
    return {
      adapter: "codex",
      runtimeName: "Codex",
      version: details.version,
      installed: details.cliAvailable,
      cliAvailable: details.cliAvailable,
      gatewayAvailable: details.appServerAvailable,
      capabilities: Object.fromEntries(Object.entries(capabilityMap).map(([key, value]) => [key, value.supported])),
      capabilityMap,
      diagnostics: {
        ...details.diagnostics,
        auth: {
          loggedIn: details.loggedIn,
          loginStatusAvailable: details.loginStatusAvailable,
        },
        appServerAvailable: details.appServerAvailable,
      },
    };
  },
  buildCompatReport(status): RuntimeCompatReport {
    const loggedIn = !!(status.diagnostics.auth as { loggedIn?: boolean } | undefined)?.loggedIn;
    const issues = [
      ...(status.cliAvailable ? [] : ["Codex CLI is not installed."]),
      ...(status.cliAvailable && !loggedIn ? ["Codex CLI is not logged in."] : []),
      ...(status.cliAvailable && !status.gatewayAvailable ? ["Codex app-server is unavailable; CLI fallback will be used."] : []),
    ];
    return buildRuntimeCompatReport({
      runtimeAdapter: "codex",
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
      suggestedRepairs: [
        ...(status.cliAvailable ? [] : ["Install Codex with `npm i -g @openai/codex`."]),
        ...(status.cliAvailable && compat.issues.some((issue) => issue.includes("not logged in")) ? ["Run `codex login`."] : []),
      ],
    };
  },
  buildInstallCommand() {
    return { command: "npm", args: ["i", "-g", "@openai/codex"] };
  },
  buildUninstallCommand() {
    return { command: "npm", args: ["uninstall", "-g", "@openai/codex"] };
  },
  buildRepairCommand() {
    return buildCodexCommand(["login", "status"]);
  },
  buildWorkspaceSetupCommand(_input) {
    return buildCodexCommand(["--version"]);
  },
  buildProgressPlan(operation, input) {
    if (operation === "setup") {
      return buildNoopProgressPlan(operation, input ?? { agentId: "default", workspaceDir: process.cwd() });
    }
    const command = operation === "install"
      ? this.buildInstallCommand()
      : operation === "uninstall"
        ? this.buildUninstallCommand()
        : this.buildRepairCommand();
    return {
      operation,
      capability: runtimeOperationCapability(operation),
      steps: [
        buildProgressStep(`runtime.${operation}.prepare`, `Prepare Codex ${operation}.`, 10),
        buildProgressStep(`runtime.${operation}.execute`, `Run Codex ${operation}.`, 70, command),
        buildProgressStep(`runtime.${operation}.finalize`, `Codex ${operation} completed.`, 100),
      ],
    };
  },
  install(runner, _installer, onProgress) {
    return runRuntimeProgressPlan(this.buildProgressPlan("install"), runner, onProgress, 120_000);
  },
  uninstall(runner, _installer, onProgress) {
    return runRuntimeProgressPlan(this.buildProgressPlan("uninstall"), runner, onProgress, 120_000);
  },
  repair(runner, onProgress) {
    return runRuntimeProgressPlan(this.buildProgressPlan("repair"), runner, onProgress, 30_000);
  },
  setupWorkspace(input, _runner, onProgress) {
    for (const step of buildNoopProgressPlan("setup", input).steps) {
      onProgress?.({
        operation: "setup",
        capability: "workspace",
        phase: step.phase,
        message: step.message,
        percent: step.percent,
        status: "complete",
        timestamp: new Date().toISOString(),
      });
    }
    return Promise.resolve();
  },
  async getProviderCatalog(): Promise<ProviderCatalog> {
    return { providers: [CODEX_PROVIDER] };
  },
  async listProviders(): Promise<ProviderDescriptor[]> {
    return [CODEX_PROVIDER];
  },
  async getModelCatalog(_runner, options): Promise<ModelCatalog> {
    return {
      models: await this.listModels(_runner, options),
      defaultModel: await this.getDefaultModel(_runner, options),
    };
  },
  async listModels(_runner, options): Promise<ModelDescriptor[]> {
    const defaultModel = readCodexDefaultModel(options) ?? "gpt-5.4";
    return CODEX_MODELS.map((model) => {
      const modelId = model.modelId ?? model.id;
      return {
        ...model,
        modelId,
        isDefault: modelId === defaultModel,
        ref: { provider: model.provider, modelId, label: model.label },
      };
    });
  },
  async getDefaultModel(_runner, options) {
    const modelId = readCodexDefaultModel(options) ?? "gpt-5.4";
    return { provider: "openai-codex", modelId, label: modelId };
  },
  async setDefaultModel(model, _runner, options) {
    writeCodexDefaultModel(model, options);
    return model;
  },
  async getAuthState(runner, options): Promise<AuthState> {
    return {
      providers: await this.getProviderAuth(runner, options),
      diagnostics: { locations: resolveCodexLocations(options) },
    };
  },
  async getProviderAuth(runner, options) {
    const details = await probeCodex(runner, options);
    return { [CODEX_PROVIDER.id]: codexAuthSummary(details.loggedIn) };
  },
  async prepareLogin(provider, runner, options): Promise<AuthLoginPlan> {
    const details = await probeCodex(runner, options);
    return {
      requestedProvider: provider,
      provider: CODEX_PROVIDER.id,
      status: details.loggedIn ? "reused" : "launch_required",
      hasExistingAuth: details.loggedIn,
      launchMode: details.loggedIn ? "none" : "terminal",
      message: details.loggedIn ? "Codex is already logged in." : "Codex login must be completed in a terminal.",
    };
  },
  async login(provider, launcher, options): Promise<AuthLoginResult> {
    const command = buildCodexCommand(["login"], options);
    const spawned = launcher.spawnDetachedPty(command.command, command.args, {
      cwd: options.cwd,
      env: command.env,
    });
    return {
      requestedProvider: provider,
      provider: CODEX_PROVIDER.id,
      status: "launched",
      launchMode: "terminal",
      pid: spawned.pid,
      command: spawned.command,
      args: spawned.args,
      message: "Codex login started in a terminal.",
    };
  },
  diagnostics(provider, options): AuthDiagnostics {
    const locations = resolveCodexLocations(options);
    return {
      provider: provider ?? CODEX_PROVIDER.id,
      authStorePath: locations.authStorePath,
      profiles: [],
      issues: [],
      locations,
    };
  },
  setApiKey(_provider, _key, _options): never {
    throw new Error("Codex API key storage is not managed by ClawJS. Use `codex login`.");
  },
  async saveApiKey(_provider, _key, _runner, _options): Promise<SaveApiKeyResult> {
    throw new Error("Codex API key storage is not managed by ClawJS. Use `codex login`.");
  },
  removeProvider() {
    return 0;
  },
  async listSchedulers() {
    return [];
  },
  async runScheduler(): Promise<void> {},
  async setSchedulerEnabled(): Promise<void> {},
  async listMemory(_runner, options): Promise<MemoryDescriptor[]> {
    const locations = resolveCodexLocations(options);
    return [
      {
        id: "codex-instructions",
        label: "Codex Instructions",
        kind: "knowledge",
        path: locations.workspacePath ? path.join(locations.workspacePath, "AGENTS.md") : undefined,
        summary: "Workspace instructions consumed by Codex.",
      },
      {
        id: "codex-home",
        label: "Codex Home",
        kind: "store",
        path: locations.homeDir,
        summary: "Codex configuration and local state directory.",
      },
    ];
  },
  async searchMemory(query, runner, options): Promise<MemoryDescriptor[]> {
    return (await this.listMemory(runner, options)).filter((entry) => `${entry.label} ${entry.summary ?? ""} ${entry.path ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  },
  async listSkills(_runner, options): Promise<SkillDescriptor[]> {
    return listCodexSkills(options);
  },
  async syncSkills(runner, options): Promise<SkillDescriptor[]> {
    return this.listSkills(runner, options);
  },
  async listChannels() {
    return [];
  },
  createSessionAdapter(options) {
    const command = buildCodexCommand(["app-server"], options);
    const fallbackCommand = buildCodexCommand([
      "exec",
      "--json",
      "--skip-git-repo-check",
      "--sandbox",
      "read-only",
      ...(options.workspacePath ? ["--cd", options.workspacePath] : []),
    ], options);
    const defaultModel = readCodexDefaultModel(options) ?? "gpt-5.4";
    return {
      transport: {
        kind: "hybrid",
        streaming: true,
        gatewayKind: "codex-app-server",
        primaryTransport: "gateway",
        fallbackTransport: "cli",
        sessionPersistence: "runtime",
        streamingMode: "hybrid",
      },
      gateway: {
        kind: "codex-app-server",
        url: "stdio://codex-app-server",
        command: command.command,
        args: command.args,
        env: command.env,
        cwd: options.workspacePath,
        model: defaultModel,
      },
      fallbackGateway: null,
      primaryTransport: "gateway",
      fallbackTransport: "cli",
      sessionPersistence: "runtime",
      streamingMode: "hybrid",
      sessionPath: resolveCodexLocations(options).homeDir ? path.join(resolveCodexLocations(options).homeDir!, "sessions") : undefined,
      buildCliInvocation(input) {
        return {
          command: fallbackCommand.command,
          args: [
            ...fallbackCommand.args,
            ...(input.model ? ["--model", input.model] : []),
            input.prompt,
          ],
          env: withCodexCommandEnv(fallbackCommand.env, options),
          timeoutMs: 130_000,
          parser: "codex-jsonl",
        };
      },
      supportsGateway: true,
    };
  },
};
