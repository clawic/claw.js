import fs from "fs";
import fsp from "fs/promises";
import crypto from "crypto";
import os from "os";
import path from "path";

import {
  assertSafeClawProjectHandoff,
  createClawProjectId,
  evaluateRegulatedAction,
  findClawProjectManifestPortabilityViolations,
  normalizeClawProjectManifest,
  resolveClawGlobalDataStorageDir,
  resolveClawPersistentSurfacePath,
  type ClawProjectManifest,
} from "@clawjs/core";

import { createPackageName, createPascalCase, createTitle, type SupportedPackageManager } from "./scaffold.ts";

const PROJECT_CONFIG_FILE = "claw.project.json";
const LOCAL_FORGE_STATE_FILE = "local-forge-state.json";
const LOCAL_FORGE_LARGE_FILE_BYTES = 10 * 1024 * 1024;
const LOCAL_FORGE_SCAN_FILE_LIMIT = 5_000;
const LOCAL_FORGE_DEFAULT_STALE_AFTER_MINUTES = 8 * 60;

export type ClawProjectType = "app" | "agent" | "server" | "workspace" | "skill" | "plugin" | "project";
export type ClawResourceType = "skill" | "plugin" | "provider" | "channel" | "command";
export type ClawIntegrationType = "provider" | "channel" | "telegram" | "scheduler" | "memory" | "workspace";

export type LocalForgeFindingKind = "dependency" | "generated" | "build_output" | "cache" | "host_private" | "secret_like" | "large_file" | "special_file" | "scan_limit";
export type LocalForgeFindingAction = "exclude" | "block";

export interface LocalForgePreflightFinding {
  path: string;
  kind: LocalForgeFindingKind;
  action: LocalForgeFindingAction;
  reason: string;
  sizeBytes?: number;
}

export interface LocalForgeFileEntry {
  path: string;
  sizeBytes: number;
  sha256: string;
}

export interface LocalForgePreflightReport {
  projectRoot: string;
  projectId: string;
  scannedAt: string;
  fileLimit: number;
  largeFileThresholdBytes: number;
  includedFiles: LocalForgeFileEntry[];
  findings: LocalForgePreflightFinding[];
  blockedCount: number;
  excludedCount: number;
  status: "ok" | "attention_required";
}

export interface LocalForgeWorktreeRecord {
  schemaVersion: 1;
  worktreeId: string;
  projectId: string;
  projectRoot: string;
  createdAt: string;
  updatedAt: string;
  checkoutLocator: {
    locatorId: string;
    kind: "local_path";
    path: string;
    mutable: true;
    authority: false;
  };
  nodeCheckout: {
    nodeId: string;
    status: "local";
  };
  authorityService: {
    serviceId: string;
    ownsChangeHistory: true;
    externalProviderAuthority: false;
  };
  versionHistory: ClawProjectFolderInspection["versionHistory"];
  nestedProjectWarnings: string[];
}

export interface LocalForgeWorkClaimRecord {
  schemaVersion: 1;
  claimId: string;
  projectId: string;
  worktreeId: string;
  actorId: string;
  agentId?: string;
  nodeId: string;
  task: string;
  intent: string;
  subpath: string;
  branch?: string;
  expectedOutput?: string;
  exclusive: boolean;
  status: "active" | "stale" | "review" | "recovered" | "abandoned";
  recoveryPolicy: "resume_review_recover_or_abandon";
  startedAt: string;
  heartbeatAt: string;
}

export interface LocalForgeSnapshotRecord {
  schemaVersion: 1;
  snapshotId: string;
  projectId: string;
  worktreeId: string;
  createdAt: string;
  reason: string;
  checkpointKind: "snapshot";
  status: "ok" | "attention_required";
  files: LocalForgeFileEntry[];
  excludedPaths: string[];
  blockedPaths: string[];
  preflight: {
    largeFileThresholdBytes: number;
    blockedCount: number;
    excludedCount: number;
  };
}

export interface LocalForgeReviewRecord {
  schemaVersion: 1;
  reviewId: string;
  projectId: string;
  worktreeId: string;
  claimId?: string;
  snapshotId?: string;
  createdAt: string;
  explanation: string;
  testsRun: string[];
  risks: string[];
  mergeStatus: "not_ready" | "needs_human_review" | "ready_for_merge";
  diffSummary: {
    includedPaths: string[];
    excludedPaths: string[];
    blockedPaths: string[];
  };
}

export interface LocalForgeMergePlanRecord {
  schemaVersion: 1;
  mergePlanId: string;
  projectId: string;
  worktreeId: string;
  baseSnapshotId: string;
  proposedSnapshotId: string;
  createdAt: string;
  conflictPolicy: "detect_and_elevate";
  status: "ready_for_review" | "blocked_conflicts";
  conflicts: Array<{
    path: string;
    baseSha256: string;
    proposedSha256: string;
    resolution: "human_review_required";
  }>;
  changes: Array<{
    path: string;
    action: "add" | "modify" | "delete";
  }>;
  noProjectMutation: true;
}

export interface LocalForgeRecoveryReceipt {
  schemaVersion: 1;
  recoveryId: string;
  projectId: string;
  worktreeId: string;
  claimId?: string;
  createdAt: string;
  action: "resume" | "review" | "merge" | "recover" | "abandon";
  status: "preview" | "recorded";
  noIrreversibleDataLoss: true;
  mutationPolicy: "metadata_only";
  evidence: string[];
}

export interface LocalForgeState {
  schemaVersion: 1;
  updatedAt: string | null;
  worktrees: Record<string, LocalForgeWorktreeRecord>;
  claims: Record<string, LocalForgeWorkClaimRecord>;
  snapshots: Record<string, LocalForgeSnapshotRecord>;
  reviews: Record<string, LocalForgeReviewRecord>;
  mergePlans: Record<string, LocalForgeMergePlanRecord>;
  recoveries: Record<string, LocalForgeRecoveryReceipt>;
  audit: Array<{ eventId: string; eventType: string; targetId: string; createdAt: string }>;
}

export interface LocalForgeStaleClaimEvaluation {
  schemaVersion: 1;
  evaluatedAt: string;
  staleAfterMinutes: number;
  staleBefore: string;
  accepted: boolean;
  staleClaims: LocalForgeWorkClaimRecord[];
  writes: boolean;
}

interface ClawProjectResourceEntry {
  id: string;
  path: string;
}

interface ClawProjectFolderAccessPolicy {
  read?: "explicit";
  write?: "none" | "grant_required";
  reason?: string;
}

interface ClawProjectFolderSyncPolicy {
  include?: boolean;
  mode?: "manifest_explicit";
}

export interface ClawProjectConfig {
  schemaVersion: number;
  manifestKind?: "claw.project";
  projectId?: string;
  type: ClawProjectType;
  name: string;
  title: string;
  primaryFolder?: {
    id: string;
    path: string;
    role: "primary";
    label?: string;
    access?: ClawProjectFolderAccessPolicy;
    sync?: ClawProjectFolderSyncPolicy;
  };
  folderRefs?: Array<{
    id: string;
    path: string;
    role?: "reference";
    label?: string;
    access?: ClawProjectFolderAccessPolicy;
    sync?: ClawProjectFolderSyncPolicy;
  }>;
  workspaceBinding?: {
    workspaceId: string;
    appId?: string;
    agentId?: string;
  };
  attachment?: {
    state: "attached" | "detached";
    workspaceId?: string;
    detachedReason?: string;
  };
  runtime: {
    adapter: string;
  };
  workspace?: {
    appId: string;
    workspaceId: string;
    agentId: string;
  };
  directories: {
    skills?: string;
    plugins?: string;
    providers?: string;
    channels?: string;
    commands?: string;
    scheduler?: string;
    memory?: string;
  };
  resources: {
    skills: ClawProjectResourceEntry[];
    plugins: ClawProjectResourceEntry[];
    providers: ClawProjectResourceEntry[];
    channels: ClawProjectResourceEntry[];
    commands: ClawProjectResourceEntry[];
    schedulers: ClawProjectResourceEntry[];
    memory: ClawProjectResourceEntry[];
  };
}

interface GeneratedEntry {
  id: string;
  path: string;
  kind: keyof ClawProjectConfig["resources"];
}

function buildJsonFilePath(rootDir: string, relativePath: string): string {
  return path.join(rootDir, relativePath);
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeTextFile(filePath: string, content: string): Promise<void> {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, content, "utf8");
}

function safeReadJson<TValue>(filePath: string): TValue | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as TValue;
  } catch {
    return null;
  }
}

function expandHome(value: string): string {
  if (value === "~") return os.homedir();
  if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
  return value;
}

export function resolveLocalForgeStateDir(env: NodeJS.ProcessEnv = process.env, dataDir?: string): string {
  const explicitData = dataDir ?? env.CLAW_DATA_DIR;
  const clawHome = env.CLAW_HOME;
  return path.join(resolveClawGlobalDataStorageDir({
    homeDir: os.homedir(),
    ...(explicitData ? { dataDir: path.resolve(expandHome(explicitData)) } : {}),
    ...(clawHome ? { clawHome: path.resolve(expandHome(clawHome)) } : {}),
  }), "local-forge");
}

function emptyLocalForgeState(): LocalForgeState {
  return {
    schemaVersion: 1,
    updatedAt: null,
    worktrees: {},
    claims: {},
    snapshots: {},
    reviews: {},
    mergePlans: {},
    recoveries: {},
    audit: [],
  };
}

function localForgeStatePath(dataDir?: string): string {
  return path.join(resolveLocalForgeStateDir(process.env, dataDir), LOCAL_FORGE_STATE_FILE);
}

function readLocalForgeState(dataDir?: string): LocalForgeState {
  const statePath = localForgeStatePath(dataDir);
  const raw = safeReadJson<Partial<LocalForgeState>>(statePath);
  if (!raw || raw.schemaVersion !== 1) return emptyLocalForgeState();
  return {
    schemaVersion: 1,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : null,
    worktrees: raw.worktrees && typeof raw.worktrees === "object" ? raw.worktrees as Record<string, LocalForgeWorktreeRecord> : {},
    claims: raw.claims && typeof raw.claims === "object" ? raw.claims as Record<string, LocalForgeWorkClaimRecord> : {},
    snapshots: raw.snapshots && typeof raw.snapshots === "object" ? raw.snapshots as Record<string, LocalForgeSnapshotRecord> : {},
    reviews: raw.reviews && typeof raw.reviews === "object" ? raw.reviews as Record<string, LocalForgeReviewRecord> : {},
    mergePlans: raw.mergePlans && typeof raw.mergePlans === "object" ? raw.mergePlans as Record<string, LocalForgeMergePlanRecord> : {},
    recoveries: raw.recoveries && typeof raw.recoveries === "object" ? raw.recoveries as Record<string, LocalForgeRecoveryReceipt> : {},
    audit: Array.isArray(raw.audit) ? raw.audit as LocalForgeState["audit"] : [],
  };
}

function writeLocalForgeState(state: LocalForgeState, dataDir?: string): string {
  const statePath = localForgeStatePath(dataDir);
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  const tmpPath = `${statePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  fs.renameSync(tmpPath, statePath);
  return statePath;
}

function localForgeAuditId(eventType: string, targetId: string, createdAt: string): string {
  return `local_forge_${eventType}_${targetId}_${createdAt}`.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase();
}

function appendLocalForgeAudit(state: LocalForgeState, eventType: string, targetId: string, createdAt: string): void {
  state.audit.push({
    eventId: localForgeAuditId(eventType, targetId, createdAt),
    eventType,
    targetId,
    createdAt,
  });
}

function stableHash(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex").slice(0, 24);
}

function fileHash(filePath: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function loadPackageJson(projectRoot: string): Record<string, unknown> | null {
  return safeReadJson<Record<string, unknown>>(path.join(projectRoot, "package.json"));
}

async function savePackageJson(projectRoot: string, packageJson: Record<string, unknown>): Promise<void> {
  await writeJsonFile(path.join(projectRoot, "package.json"), packageJson);
}

export function locateProjectRoot(startDir: string): string | null {
  let current = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(current, PROJECT_CONFIG_FILE))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

export function readProjectConfig(projectRoot: string): ClawProjectConfig | null {
  const raw = safeReadJson<ClawProjectConfig>(path.join(projectRoot, PROJECT_CONFIG_FILE));
  if (!raw) return null;
  try {
    return normalizeClawProjectManifest(raw, path.basename(projectRoot)) as ClawProjectConfig;
  } catch {
    return null;
  }
}

async function writeProjectConfig(projectRoot: string, config: ClawProjectConfig): Promise<void> {
  await writeJsonFile(path.join(projectRoot, PROJECT_CONFIG_FILE), normalizeClawProjectManifest(config, path.basename(projectRoot)));
}

function createProjectConfig(input: {
  type: ClawProjectType;
  slug: string;
  title: string;
  runtimeAdapter?: string;
}): ClawProjectConfig {
  const base = {
    schemaVersion: 1,
    manifestKind: "claw.project",
    projectId: createClawProjectId(input.slug),
    type: input.type,
    name: input.slug,
    title: input.title,
    primaryFolder: {
      id: "primary",
      path: ".",
      role: "primary",
    },
    folderRefs: [],
    runtime: {
      adapter: input.runtimeAdapter ?? "demo",
    },
    resources: {
      skills: [],
      plugins: [],
      providers: [],
      channels: [],
      commands: [],
      schedulers: [],
      memory: [],
    },
  } satisfies Omit<ClawProjectConfig, "directories" | "workspace">;

  if (input.type === "skill") {
    return {
      ...base,
      directories: {
        skills: "src",
      },
    };
  }

  if (input.type === "plugin") {
    return {
      ...base,
      directories: {
        skills: "src/skills",
        plugins: "src",
        providers: "claw/providers",
        channels: "claw/channels",
        commands: "claw/commands",
        scheduler: "claw/scheduler",
        memory: "claw/memory",
      },
    };
  }

  return {
    ...base,
      workspace: {
        appId: input.slug,
        workspaceId: input.slug,
        agentId: input.slug,
      },
      workspaceBinding: {
        appId: input.slug,
        workspaceId: input.slug,
        agentId: input.slug,
      },
      attachment: {
        state: "attached",
        workspaceId: input.slug,
      },
    directories: {
      skills: "claw/skills",
      plugins: "claw/plugins",
      providers: "claw/providers",
      channels: "claw/channels",
      commands: "claw/commands",
      scheduler: "claw/scheduler",
      memory: "claw/memory",
    },
  };
}

function ensureResourceBucket(config: ClawProjectConfig, bucket: keyof ClawProjectConfig["resources"]): ClawProjectResourceEntry[] {
  const value = config.resources[bucket];
  if (Array.isArray(value)) return value;
  config.resources[bucket] = [];
  return config.resources[bucket];
}

function registerResource(config: ClawProjectConfig, entry: GeneratedEntry): void {
  const bucket = ensureResourceBucket(config, entry.kind);
  const existing = bucket.find((item) => item.id === entry.id);
  if (existing) {
    existing.path = entry.path;
    return;
  }
  bucket.push({ id: entry.id, path: entry.path });
}

function assertDirectory(directory: string | undefined, label: string): string {
  if (!directory) {
    throw new Error(`This project does not define a ${label} directory in ${PROJECT_CONFIG_FILE}.`);
  }
  const normalized = normalizeProjectDirectory(directory, label);
  return normalized;
}

function normalizeProjectDirectory(directory: string, label: string): string {
  const trimmed = directory.trim();
  const normalized = path.posix.normalize(trimmed.replace(/\\/g, "/"));
  if (
    !trimmed
    || trimmed.includes("\0")
    || path.isAbsolute(trimmed)
    || /^[A-Za-z]:[\\/]/.test(trimmed)
    || normalized === ".."
    || normalized.startsWith("../")
  ) {
    throw new Error(`Invalid project ${label} directory in ${PROJECT_CONFIG_FILE}: ${directory}`);
  }
  return normalized;
}

function buildSkillContent(slug: string, title: string, pascal: string): string {
  return `export interface ${pascal}SkillInput {\n  text: string;\n}\n\nexport interface ${pascal}SkillOutput {\n  summary: string;\n}\n\nexport async function run${pascal}Skill(input: ${pascal}SkillInput): Promise<${pascal}SkillOutput> {\n  return {\n    summary: \`TODO: implement ${title} for \${input.text}\`,\n  };\n}\n`;
}

function buildPluginContent(slug: string, title: string, pascal: string): string {
  return `export interface ${pascal}PluginConfig {\n  enabled?: boolean;\n}\n\nexport function create${pascal}Plugin(config: ${pascal}PluginConfig = {}) {\n  return {\n    id: "${slug}",\n    name: "${title}",\n    enabled: config.enabled ?? true,\n  };\n}\n`;
}

function buildCommandContent(slug: string, title: string): Record<string, unknown> {
  return {
    id: slug,
    name: title,
    description: `TODO: describe the ${title} command.`,
    handler: `claw/commands/${slug}.ts`,
  };
}

function buildProviderContent(slug: string, title: string): Record<string, unknown> {
  return {
    id: slug,
    name: title,
    type: "provider",
    auth: {
      strategy: "api_key",
      secretName: `TODO_${slug.toUpperCase().replace(/-/g, "_")}_SECRET`,
    },
  };
}

function buildChannelContent(slug: string, title: string): Record<string, unknown> {
  return {
    id: slug,
    name: title,
    type: "channel",
    enabled: true,
  };
}

function buildSchedulerContent(slug: string, title: string): Record<string, unknown> {
  return {
    id: slug,
    name: title,
    enabled: true,
    schedule: "TODO",
    handler: `claw/commands/${slug}.json`,
  };
}

function buildMemoryContent(slug: string, title: string): Record<string, unknown> {
  return {
    id: slug,
    name: title,
    provider: "filesystem",
    enabled: true,
  };
}

export async function generateProjectResource(projectRoot: string, config: ClawProjectConfig, resource: ClawResourceType, name: string): Promise<GeneratedEntry> {
  const slug = createPackageName(name, resource);
  const title = createTitle(slug, slug);
  const pascal = createPascalCase(slug, "ClawResource");

  if (resource === "skill") {
    const relativePath = path.join(assertDirectory(config.directories.skills, "skills"), `${slug}.ts`);
    await writeTextFile(buildJsonFilePath(projectRoot, relativePath), buildSkillContent(slug, title, pascal));
    const entry = { id: slug, path: relativePath, kind: "skills" as const };
    registerResource(config, entry);
    await writeProjectConfig(projectRoot, config);
    return entry;
  }

  if (resource === "plugin") {
    const relativePath = path.join(assertDirectory(config.directories.plugins, "plugins"), `${slug}.ts`);
    await writeTextFile(buildJsonFilePath(projectRoot, relativePath), buildPluginContent(slug, title, pascal));
    const entry = { id: slug, path: relativePath, kind: "plugins" as const };
    registerResource(config, entry);
    await writeProjectConfig(projectRoot, config);
    return entry;
  }

  if (resource === "provider") {
    const relativePath = path.join(assertDirectory(config.directories.providers, "providers"), `${slug}.json`);
    await writeJsonFile(buildJsonFilePath(projectRoot, relativePath), buildProviderContent(slug, title));
    const entry = { id: slug, path: relativePath, kind: "providers" as const };
    registerResource(config, entry);
    await writeProjectConfig(projectRoot, config);
    return entry;
  }

  if (resource === "channel") {
    const relativePath = path.join(assertDirectory(config.directories.channels, "channels"), `${slug}.json`);
    await writeJsonFile(buildJsonFilePath(projectRoot, relativePath), buildChannelContent(slug, title));
    const entry = { id: slug, path: relativePath, kind: "channels" as const };
    registerResource(config, entry);
    await writeProjectConfig(projectRoot, config);
    return entry;
  }

  const relativePath = path.join(assertDirectory(config.directories.commands, "commands"), `${slug}.json`);
  await writeJsonFile(buildJsonFilePath(projectRoot, relativePath), buildCommandContent(slug, title));
  const entry = { id: slug, path: relativePath, kind: "commands" as const };
  registerResource(config, entry);
  await writeProjectConfig(projectRoot, config);
  return entry;
}

function ensurePackageJsonScripts(packageJson: Record<string, unknown>): Record<string, string> {
  const scripts = packageJson.scripts;
  if (scripts && typeof scripts === "object" && !Array.isArray(scripts)) {
    return scripts as Record<string, string>;
  }
  const created: Record<string, string> = {};
  packageJson.scripts = created;
  return created;
}

async function maybeInstallDependencies(
  projectRoot: string,
  packageManager: SupportedPackageManager,
  dependencies: string[],
  runCommand?: (command: string, args: string[], options: { cwd: string }) => Promise<void>,
): Promise<void> {
  if (dependencies.length === 0) return;
  const exec = runCommand;
  if (!exec) return;
  await exec(packageManager, ["install", ...dependencies], { cwd: projectRoot });
}

export async function addProjectIntegration(
  projectRoot: string,
  config: ClawProjectConfig,
  integration: ClawIntegrationType,
  options: {
    name?: string;
    packageManager: SupportedPackageManager;
    runCommand?: (command: string, args: string[], options: { cwd: string }) => Promise<void>;
  },
): Promise<{ created: GeneratedEntry; installedDependencies: string[] }> {
  if (integration === "workspace") {
    const packageJson = loadPackageJson(projectRoot) ?? {};
    const scripts = ensurePackageJsonScripts(packageJson);
    const dependencies = (packageJson.dependencies && typeof packageJson.dependencies === "object" && !Array.isArray(packageJson.dependencies))
      ? packageJson.dependencies as Record<string, string>
      : {};
    dependencies["@clawjs/workspace"] = dependencies["@clawjs/workspace"]
      ?? ((packageJson.dependencies as Record<string, string> | undefined)?.["@clawjs/claw"] ?? "^0.1.0");
    packageJson.dependencies = dependencies;
    scripts["claw:workspace:reindex"] = `claw search rebuild --workspace .`;
    await savePackageJson(projectRoot, packageJson);
    await maybeInstallDependencies(projectRoot, options.packageManager, ["@clawjs/workspace"], options.runCommand);
    return {
      created: {
        id: "workspace",
        path: "package.json",
        kind: "plugins",
      },
      installedDependencies: ["@clawjs/workspace"],
    };
  }

  if (integration === "provider") {
    const created = await generateProjectResource(projectRoot, config, "provider", options.name ?? "provider");
    return { created, installedDependencies: [] };
  }

  if (integration === "channel") {
    const created = await generateProjectResource(projectRoot, config, "channel", options.name ?? "channel");
    return { created, installedDependencies: [] };
  }

  if (integration === "telegram") {
    const slug = "telegram";
    const relativePath = path.join(assertDirectory(config.directories.channels, "channels"), `${slug}.json`);
    await writeJsonFile(buildJsonFilePath(projectRoot, relativePath), {
      id: slug,
      name: "Telegram",
      type: "channel",
      enabled: true,
      transport: {
        mode: "polling",
        secretName: "TODO_TELEGRAM_BOT_TOKEN",
      },
    });
    const entry = { id: slug, path: relativePath, kind: "channels" as const };
    registerResource(config, entry);
    await writeProjectConfig(projectRoot, config);

    const packageJson = loadPackageJson(projectRoot);
    if (packageJson) {
      const scripts = ensurePackageJsonScripts(packageJson);
      scripts["claw:telegram:status"] = `claw --runtime ${config.runtime.adapter} telegram status --workspace .`;
      scripts["claw:telegram:connect"] = `claw --runtime ${config.runtime.adapter} telegram connect --workspace . --secret-name TODO_TELEGRAM_BOT_TOKEN`;
      await savePackageJson(projectRoot, packageJson);
    }

    return { created: entry, installedDependencies: [] };
  }

  if (integration === "scheduler") {
    const slug = createPackageName(options.name ?? "default-scheduler", "scheduler");
    const title = createTitle(slug, "Scheduler");
    const relativePath = path.join(assertDirectory(config.directories.scheduler, "scheduler"), `${slug}.json`);
    await writeJsonFile(buildJsonFilePath(projectRoot, relativePath), buildSchedulerContent(slug, title));
    const entry = { id: slug, path: relativePath, kind: "schedulers" as const };
    registerResource(config, entry);
    await writeProjectConfig(projectRoot, config);
    return { created: entry, installedDependencies: [] };
  }

  const slug = createPackageName(options.name ?? "default-memory", "memory");
  const title = createTitle(slug, "Memory");
  const relativePath = path.join(assertDirectory(config.directories.memory, "memory"), `${slug}.json`);
  await writeJsonFile(buildJsonFilePath(projectRoot, relativePath), buildMemoryContent(slug, title));
  const entry = { id: slug, path: relativePath, kind: "memory" as const };
  registerResource(config, entry);
  await writeProjectConfig(projectRoot, config);
  await maybeInstallDependencies(projectRoot, options.packageManager, [], options.runCommand);
  return { created: entry, installedDependencies: [] };
}

export async function collectProjectSnapshot(projectRoot: string): Promise<Record<string, unknown>> {
  const project = readProjectConfig(projectRoot);
  const packageJson = loadPackageJson(projectRoot);
  const manifestPath = resolveClawPersistentSurfacePath("claw.workspace.manifest", projectRoot);
  const manifest = safeReadJson<Record<string, unknown>>(manifestPath);
  const nodeModulesPackage = safeReadJson<{ version?: string }>(path.join(projectRoot, "node_modules", "@clawjs", "claw", "package.json"));
  const rootPackage = safeReadJson<{ version?: string }>(path.join(projectRoot, "package.json"));

  return {
    projectRoot,
    project,
    packageJson: packageJson ? {
      name: packageJson.name,
      version: packageJson.version,
      sdkDependency: (packageJson.dependencies as Record<string, string> | undefined)?.["@clawjs/claw"]
        ?? (packageJson.devDependencies as Record<string, string> | undefined)?.["@clawjs/claw"]
        ?? null,
      workspaceDependency: (packageJson.dependencies as Record<string, string> | undefined)?.["@clawjs/workspace"]
        ?? (packageJson.devDependencies as Record<string, string> | undefined)?.["@clawjs/workspace"]
        ?? null,
      cliDependency: (packageJson.dependencies as Record<string, string> | undefined)?.["@clawjs/cli"]
        ?? (packageJson.devDependencies as Record<string, string> | undefined)?.["@clawjs/cli"]
        ?? null,
    } : null,
    installedSdkVersion: nodeModulesPackage?.version ?? null,
    cliVersion: rootPackage?.version ?? null,
    workspace: manifest ? {
      manifestPath,
      manifest,
    } : null,
  };
}

export interface ClawProjectFolderInspection {
  projectRoot: string;
  manifestPath: string;
  manifest: ClawProjectManifest | null;
  exists: boolean;
  hasWorkspaceDirectory: boolean;
  agentsPath: string;
  claudePath: string;
  agentsManaged: boolean;
  claudeShim: boolean;
  versionHistory: {
    existingGitDetected: boolean;
    enabledByDefault: false;
    willEnableOnAttach: false;
    mode: "existing_git_detected" | "off_until_explicit_opt_in";
  };
  state: "missing" | "unattached" | "attached" | "detached" | "duplicate";
  warnings: string[];
}

export interface ClawProjectAttachPreview {
  projectRoot: string;
  manifestPath: string;
  projectId: string;
  workspaceId: string;
  writes: Array<{ path: string; action: "create" | "update" | "unchanged" }>;
  versionHistory: ClawProjectFolderInspection["versionHistory"];
  warnings: string[];
  accepted: boolean;
  manifest: ClawProjectManifest;
}

export interface ClawProjectImportPreview extends ClawProjectAttachPreview {
  handoffPath: string;
  handoffKind: "claw.project.handoff";
}

function readTextSafe(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

function hasExistingGitRepository(projectRoot: string): boolean {
  const dotGitPath = path.join(projectRoot, ".git");
  if (!fs.existsSync(dotGitPath)) return false;
  const stat = fs.statSync(dotGitPath);
  return stat.isDirectory() || stat.isFile();
}

function versionHistoryPreview(projectRoot: string): ClawProjectFolderInspection["versionHistory"] {
  const existingGitDetected = hasExistingGitRepository(projectRoot);
  return {
    existingGitDetected,
    enabledByDefault: false,
    willEnableOnAttach: false,
    mode: existingGitDetected ? "existing_git_detected" : "off_until_explicit_opt_in",
  };
}

function localProjectId(projectRoot: string): string {
  return readProjectConfig(projectRoot)?.projectId ?? createClawProjectId(path.basename(projectRoot));
}

function localForgeWorktreeId(projectId: string, projectRoot: string): string {
  return `worktree_${stableHash(`${projectId}:${path.resolve(projectRoot)}`)}`;
}

function localForgeLocatorId(projectRoot: string): string {
  return `locator_${stableHash(path.resolve(projectRoot))}`;
}

function relativeProjectPath(projectRoot: string, absolutePath: string): string {
  return path.relative(projectRoot, absolutePath).split(path.sep).join("/");
}

function nestedProjectWarnings(projectRoot: string): string[] {
  const warnings: string[] = [];
  const stack = [projectRoot];
  while (stack.length > 0 && warnings.length < 20) {
    const current = stack.pop();
    if (!current) continue;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === ".git" || entry.name === "node_modules" || entry.name === ".claw") continue;
      const child = path.join(current, entry.name);
      if (fs.existsSync(path.join(child, PROJECT_CONFIG_FILE))) warnings.push(`nested_project:${relativeProjectPath(projectRoot, child)}`);
      stack.push(child);
    }
  }
  return warnings;
}

function classifyForgePath(relativePath: string, sizeBytes: number): LocalForgePreflightFinding | null {
  const parts = relativePath.split("/");
  const basename = parts[parts.length - 1] ?? relativePath;
  const lower = relativePath.toLowerCase();
  const directoryKinds: Array<{ names: string[]; kind: LocalForgeFindingKind; reason: string }> = [
    { names: ["node_modules", "vendor", "Pods", ".venv", "venv", ".gradle"], kind: "dependency", reason: "Dependency and vendor folders are excluded from local forge history by default." },
    { names: ["dist", "build", "out", ".next", "DerivedData", ".dart_tool", ".flutter-plugins-dependencies"], kind: "build_output", reason: "Build output is excluded from local forge history by default." },
    { names: ["coverage", ".cache", "__pycache__", ".turbo"], kind: "cache", reason: "Cache folders are excluded from local forge history by default." },
    { names: [".git", ".claw", ".idea", ".vscode"], kind: "host_private", reason: "Host-private and framework-private state is excluded from local forge history by default." },
  ];
  for (const directoryKind of directoryKinds) {
    if (parts.some((part) => directoryKind.names.includes(part))) {
      return { path: relativePath, kind: directoryKind.kind, action: "exclude", reason: directoryKind.reason, sizeBytes };
    }
  }
  if (
    basename === ".env"
    || basename.startsWith(".env.")
    || /(^|[._-])(secret|secrets|credential|credentials|token|password|private[-_]?key)([._-]|$)/i.test(basename)
    || lower.endsWith("/id_rsa")
    || lower.endsWith("/id_ed25519")
    || lower.endsWith(".pem")
    || lower.endsWith(".key")
  ) {
    return {
      path: relativePath,
      kind: "secret_like",
      action: "block",
      reason: "Secret-looking files are blocked from snapshots, review diffs, and history.",
      sizeBytes,
    };
  }
  if (sizeBytes > LOCAL_FORGE_LARGE_FILE_BYTES) {
    return {
      path: relativePath,
      kind: "large_file",
      action: "block",
      reason: "Large files require an explicit blob or LFS policy before history capture.",
      sizeBytes,
    };
  }
  return null;
}

function scanForgeFiles(projectRoot: string, fileLimit = LOCAL_FORGE_SCAN_FILE_LIMIT): { files: LocalForgeFileEntry[]; findings: LocalForgePreflightFinding[] } {
  const files: LocalForgeFileEntry[] = [];
  const findings: LocalForgePreflightFinding[] = [];
  const stack = [projectRoot];
  let visited = 0;
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (visited >= fileLimit) {
        findings.push({
          path: ".",
          kind: "scan_limit",
          action: "block",
          reason: `Preflight stopped after ${fileLimit} files; narrow the path or raise the reviewed limit.`,
        });
        return { files, findings };
      }
      const absolutePath = path.join(current, entry.name);
      const relativePath = relativeProjectPath(projectRoot, absolutePath);
      if (entry.isDirectory()) {
        const directoryFinding = classifyForgePath(`${relativePath}/`, 0);
        if (directoryFinding) {
          findings.push(directoryFinding);
          continue;
        }
        stack.push(absolutePath);
        continue;
      }
      visited += 1;
      let stat: fs.Stats;
      try {
        stat = fs.lstatSync(absolutePath);
      } catch {
        continue;
      }
      if (!stat.isFile()) {
        findings.push({
          path: relativePath,
          kind: "special_file",
          action: "exclude",
          reason: "Special files are excluded from local forge history by default.",
          sizeBytes: stat.size,
        });
        continue;
      }
      const finding = classifyForgePath(relativePath, stat.size);
      if (finding) {
        findings.push(finding);
        continue;
      }
      files.push({
        path: relativePath,
        sizeBytes: stat.size,
        sha256: fileHash(absolutePath),
      });
    }
  }
  return { files: files.sort((left, right) => left.path.localeCompare(right.path)), findings: findings.sort((left, right) => left.path.localeCompare(right.path)) };
}

export function runLocalForgePreflight(projectRoot: string, options: { now?: string; fileLimit?: number } = {}): LocalForgePreflightReport {
  const resolved = path.resolve(projectRoot);
  const now = options.now ?? new Date().toISOString();
  const projectId = localProjectId(resolved);
  const { files, findings } = scanForgeFiles(resolved, options.fileLimit ?? LOCAL_FORGE_SCAN_FILE_LIMIT);
  const blockedCount = findings.filter((finding) => finding.action === "block").length;
  const excludedCount = findings.filter((finding) => finding.action === "exclude").length;
  return {
    projectRoot: resolved,
    projectId,
    scannedAt: now,
    fileLimit: options.fileLimit ?? LOCAL_FORGE_SCAN_FILE_LIMIT,
    largeFileThresholdBytes: LOCAL_FORGE_LARGE_FILE_BYTES,
    includedFiles: files,
    findings,
    blockedCount,
    excludedCount,
    status: blockedCount > 0 ? "attention_required" : "ok",
  };
}

function buildLocalForgeWorktree(projectRoot: string, input: { nodeId?: string; authorityServiceId?: string; now?: string } = {}): LocalForgeWorktreeRecord {
  const resolved = path.resolve(projectRoot);
  const now = input.now ?? new Date().toISOString();
  const projectId = localProjectId(resolved);
  return {
    schemaVersion: 1,
    worktreeId: localForgeWorktreeId(projectId, resolved),
    projectId,
    projectRoot: resolved,
    createdAt: now,
    updatedAt: now,
    checkoutLocator: {
      locatorId: localForgeLocatorId(resolved),
      kind: "local_path",
      path: resolved,
      mutable: true,
      authority: false,
    },
    nodeCheckout: {
      nodeId: input.nodeId ?? "local",
      status: "local",
    },
    authorityService: {
      serviceId: input.authorityServiceId ?? "local.forge",
      ownsChangeHistory: true,
      externalProviderAuthority: false,
    },
    versionHistory: versionHistoryPreview(resolved),
    nestedProjectWarnings: nestedProjectWarnings(resolved),
  };
}

export function readLocalForgeInventory(dataDir?: string): LocalForgeState & { statePath: string } {
  return {
    ...readLocalForgeState(dataDir),
    statePath: localForgeStatePath(dataDir),
  };
}

export function evaluateLocalForgeStaleClaims(input: {
  dataDir?: string;
  accept?: boolean;
  projectId?: string;
  now?: string;
  staleAfterMinutes?: number;
}): LocalForgeStaleClaimEvaluation & { statePath: string } {
  const now = input.now ?? new Date().toISOString();
  const requestedMinutes = input.staleAfterMinutes;
  const staleAfterMinutes = Number.isFinite(requestedMinutes) && requestedMinutes && requestedMinutes > 0
    ? Math.floor(requestedMinutes)
    : LOCAL_FORGE_DEFAULT_STALE_AFTER_MINUTES;
  const staleBefore = new Date(Date.parse(now) - staleAfterMinutes * 60 * 1000).toISOString();
  const state = readLocalForgeState(input.dataDir);
  const staleClaims = Object.values(state.claims)
    .filter((claim) => claim.status === "active")
    .filter((claim) => !input.projectId || claim.projectId === input.projectId)
    .filter((claim) => Date.parse(claim.heartbeatAt) <= Date.parse(staleBefore))
    .sort((left, right) => left.claimId.localeCompare(right.claimId));
  const statePath = localForgeStatePath(input.dataDir);
  if (!input.accept || staleClaims.length === 0) {
    return {
      schemaVersion: 1,
      evaluatedAt: now,
      staleAfterMinutes,
      staleBefore,
      accepted: false,
      staleClaims,
      writes: false,
      statePath,
    };
  }
  for (const claim of staleClaims) {
    state.claims[claim.claimId] = {
      ...claim,
      status: "stale",
    };
    appendLocalForgeAudit(state, "claim.marked_stale", claim.claimId, now);
  }
  state.updatedAt = now;
  writeLocalForgeState(state, input.dataDir);
  return {
    schemaVersion: 1,
    evaluatedAt: now,
    staleAfterMinutes,
    staleBefore,
    accepted: true,
    staleClaims: staleClaims.map((claim) => ({ ...claim, status: "stale" })),
    writes: true,
    statePath,
  };
}

export function recordLocalForgeWorktree(input: { projectRoot: string; dataDir?: string; accept?: boolean; nodeId?: string; authorityServiceId?: string; now?: string }): { accepted: boolean; statePath: string; worktree: LocalForgeWorktreeRecord } {
  const worktree = buildLocalForgeWorktree(input.projectRoot, input);
  const statePath = localForgeStatePath(input.dataDir);
  if (!input.accept) return { accepted: false, statePath, worktree };
  const state = readLocalForgeState(input.dataDir);
  const previous = state.worktrees[worktree.worktreeId];
  state.worktrees[worktree.worktreeId] = {
    ...worktree,
    createdAt: previous?.createdAt ?? worktree.createdAt,
  };
  state.updatedAt = input.now ?? new Date().toISOString();
  appendLocalForgeAudit(state, "worktree.recorded", worktree.worktreeId, state.updatedAt);
  writeLocalForgeState(state, input.dataDir);
  return { accepted: true, statePath, worktree: state.worktrees[worktree.worktreeId] };
}

export function createLocalForgeClaim(input: {
  projectRoot: string;
  dataDir?: string;
  accept?: boolean;
  exclusive?: boolean;
  actorId?: string;
  agentId?: string;
  nodeId?: string;
  task?: string;
  intent?: string;
  subpath?: string;
  branch?: string;
  expectedOutput?: string;
  now?: string;
}): { accepted: boolean; statePath: string; claim: LocalForgeWorkClaimRecord; conflicts: LocalForgeWorkClaimRecord[] } {
  const now = input.now ?? new Date().toISOString();
  const worktree = buildLocalForgeWorktree(input.projectRoot, { nodeId: input.nodeId, now });
  const state = readLocalForgeState(input.dataDir);
  const subpath = input.subpath ?? ".";
  const conflicts = Object.values(state.claims).filter((claim) => claim.worktreeId === worktree.worktreeId && claim.status === "active" && (claim.exclusive || input.exclusive));
  const claim: LocalForgeWorkClaimRecord = {
    schemaVersion: 1,
    claimId: `claim_${stableHash(`${worktree.worktreeId}:${input.actorId ?? input.agentId ?? "agent"}:${input.task ?? "work"}:${subpath}:${now}`)}`,
    projectId: worktree.projectId,
    worktreeId: worktree.worktreeId,
    actorId: input.actorId ?? input.agentId ?? "agent.local",
    ...(input.agentId ? { agentId: input.agentId } : {}),
    nodeId: input.nodeId ?? "local",
    task: input.task ?? "unspecified",
    intent: input.intent ?? "reviewable_local_work",
    subpath,
    ...(input.branch ? { branch: input.branch } : {}),
    ...(input.expectedOutput ? { expectedOutput: input.expectedOutput } : {}),
    exclusive: Boolean(input.exclusive),
    status: "active",
    recoveryPolicy: "resume_review_recover_or_abandon",
    startedAt: now,
    heartbeatAt: now,
  };
  const statePath = localForgeStatePath(input.dataDir);
  if (!input.accept || conflicts.length > 0) return { accepted: false, statePath, claim, conflicts };
  state.worktrees[worktree.worktreeId] = state.worktrees[worktree.worktreeId] ?? worktree;
  state.claims[claim.claimId] = claim;
  state.updatedAt = now;
  appendLocalForgeAudit(state, "claim.recorded", claim.claimId, now);
  writeLocalForgeState(state, input.dataDir);
  return { accepted: true, statePath, claim, conflicts: [] };
}

export function createLocalForgeSnapshot(input: { projectRoot: string; dataDir?: string; accept?: boolean; reason?: string; nodeId?: string; now?: string }): { accepted: boolean; statePath: string; snapshot: LocalForgeSnapshotRecord; preflight: LocalForgePreflightReport } {
  const now = input.now ?? new Date().toISOString();
  const worktree = buildLocalForgeWorktree(input.projectRoot, { nodeId: input.nodeId, now });
  const preflight = runLocalForgePreflight(input.projectRoot, { now });
  const snapshot: LocalForgeSnapshotRecord = {
    schemaVersion: 1,
    snapshotId: `snapshot_${stableHash(`${worktree.worktreeId}:${now}:${input.reason ?? "checkpoint"}`)}`,
    projectId: worktree.projectId,
    worktreeId: worktree.worktreeId,
    createdAt: now,
    reason: input.reason ?? "checkpoint",
    checkpointKind: "snapshot",
    status: preflight.status,
    files: preflight.includedFiles,
    excludedPaths: preflight.findings.filter((finding) => finding.action === "exclude").map((finding) => finding.path),
    blockedPaths: preflight.findings.filter((finding) => finding.action === "block").map((finding) => finding.path),
    preflight: {
      largeFileThresholdBytes: preflight.largeFileThresholdBytes,
      blockedCount: preflight.blockedCount,
      excludedCount: preflight.excludedCount,
    },
  };
  const statePath = localForgeStatePath(input.dataDir);
  if (!input.accept) return { accepted: false, statePath, snapshot, preflight };
  const state = readLocalForgeState(input.dataDir);
  state.worktrees[worktree.worktreeId] = state.worktrees[worktree.worktreeId] ?? worktree;
  state.snapshots[snapshot.snapshotId] = snapshot;
  state.updatedAt = now;
  appendLocalForgeAudit(state, "snapshot.recorded", snapshot.snapshotId, now);
  writeLocalForgeState(state, input.dataDir);
  return { accepted: true, statePath, snapshot, preflight };
}

export function createLocalForgeReview(input: {
  projectRoot: string;
  dataDir?: string;
  accept?: boolean;
  claimId?: string;
  snapshotId?: string;
  explanation?: string;
  testsRun?: string[];
  risks?: string[];
  mergeStatus?: LocalForgeReviewRecord["mergeStatus"];
  now?: string;
}): { accepted: boolean; statePath: string; review: LocalForgeReviewRecord; preflight: LocalForgePreflightReport } {
  const now = input.now ?? new Date().toISOString();
  const worktree = buildLocalForgeWorktree(input.projectRoot, { now });
  const preflight = runLocalForgePreflight(input.projectRoot, { now });
  const review: LocalForgeReviewRecord = {
    schemaVersion: 1,
    reviewId: `review_${stableHash(`${worktree.worktreeId}:${input.claimId ?? ""}:${input.snapshotId ?? ""}:${now}`)}`,
    projectId: worktree.projectId,
    worktreeId: worktree.worktreeId,
    ...(input.claimId ? { claimId: input.claimId } : {}),
    ...(input.snapshotId ? { snapshotId: input.snapshotId } : {}),
    createdAt: now,
    explanation: input.explanation ?? "Local forge review record.",
    testsRun: input.testsRun ?? [],
    risks: input.risks ?? [],
    mergeStatus: input.mergeStatus ?? "needs_human_review",
    diffSummary: {
      includedPaths: preflight.includedFiles.map((file) => file.path),
      excludedPaths: preflight.findings.filter((finding) => finding.action === "exclude").map((finding) => finding.path),
      blockedPaths: preflight.findings.filter((finding) => finding.action === "block").map((finding) => finding.path),
    },
  };
  const statePath = localForgeStatePath(input.dataDir);
  if (!input.accept) return { accepted: false, statePath, review, preflight };
  const state = readLocalForgeState(input.dataDir);
  state.worktrees[worktree.worktreeId] = state.worktrees[worktree.worktreeId] ?? worktree;
  state.reviews[review.reviewId] = review;
  state.updatedAt = now;
  appendLocalForgeAudit(state, "review.recorded", review.reviewId, now);
  writeLocalForgeState(state, input.dataDir);
  return { accepted: true, statePath, review, preflight };
}

export function createLocalForgeMergePlan(input: {
  projectRoot: string;
  dataDir?: string;
  accept?: boolean;
  baseSnapshotId: string;
  proposedSnapshotId: string;
  now?: string;
}): { accepted: boolean; statePath: string; mergePlan: LocalForgeMergePlanRecord } {
  const now = input.now ?? new Date().toISOString();
  const worktree = buildLocalForgeWorktree(input.projectRoot, { now });
  const state = readLocalForgeState(input.dataDir);
  const baseSnapshot = state.snapshots[input.baseSnapshotId];
  const proposedSnapshot = state.snapshots[input.proposedSnapshotId];
  if (!baseSnapshot || !proposedSnapshot) {
    throw new Error("Local forge merge plan requires two recorded snapshots.");
  }
  const baseByPath = new Map(baseSnapshot.files.map((file) => [file.path, file]));
  const proposedByPath = new Map(proposedSnapshot.files.map((file) => [file.path, file]));
  const paths = [...new Set([...baseByPath.keys(), ...proposedByPath.keys()])].sort();
  const conflicts: LocalForgeMergePlanRecord["conflicts"] = [];
  const changes: LocalForgeMergePlanRecord["changes"] = [];
  for (const filePath of paths) {
    const base = baseByPath.get(filePath);
    const proposed = proposedByPath.get(filePath);
    if (base && proposed && base.sha256 === proposed.sha256) continue;
    if (base && proposed) {
      conflicts.push({
        path: filePath,
        baseSha256: base.sha256,
        proposedSha256: proposed.sha256,
        resolution: "human_review_required",
      });
      changes.push({ path: filePath, action: "modify" });
      continue;
    }
    changes.push({ path: filePath, action: base ? "delete" : "add" });
  }
  const mergePlan: LocalForgeMergePlanRecord = {
    schemaVersion: 1,
    mergePlanId: `merge_plan_${stableHash(`${worktree.worktreeId}:${input.baseSnapshotId}:${input.proposedSnapshotId}:${now}`)}`,
    projectId: worktree.projectId,
    worktreeId: worktree.worktreeId,
    baseSnapshotId: input.baseSnapshotId,
    proposedSnapshotId: input.proposedSnapshotId,
    createdAt: now,
    conflictPolicy: "detect_and_elevate",
    status: conflicts.length > 0 ? "blocked_conflicts" : "ready_for_review",
    conflicts,
    changes,
    noProjectMutation: true,
  };
  const statePath = localForgeStatePath(input.dataDir);
  if (!input.accept) return { accepted: false, statePath, mergePlan };
  state.worktrees[worktree.worktreeId] = state.worktrees[worktree.worktreeId] ?? worktree;
  state.mergePlans[mergePlan.mergePlanId] = mergePlan;
  state.updatedAt = now;
  appendLocalForgeAudit(state, "merge_plan.recorded", mergePlan.mergePlanId, now);
  writeLocalForgeState(state, input.dataDir);
  return { accepted: true, statePath, mergePlan };
}

export function createLocalForgeRecoveryReceipt(input: {
  projectRoot: string;
  dataDir?: string;
  accept?: boolean;
  claimId?: string;
  action: LocalForgeRecoveryReceipt["action"];
  now?: string;
}): { accepted: boolean; statePath: string; recovery: LocalForgeRecoveryReceipt } {
  const now = input.now ?? new Date().toISOString();
  const worktree = buildLocalForgeWorktree(input.projectRoot, { now });
  const recovery: LocalForgeRecoveryReceipt = {
    schemaVersion: 1,
    recoveryId: `recovery_${stableHash(`${worktree.worktreeId}:${input.claimId ?? ""}:${input.action}:${now}`)}`,
    projectId: worktree.projectId,
    worktreeId: worktree.worktreeId,
    ...(input.claimId ? { claimId: input.claimId } : {}),
    createdAt: now,
    action: input.action,
    status: input.accept ? "recorded" : "preview",
    noIrreversibleDataLoss: true,
    mutationPolicy: "metadata_only",
    evidence: [
      "Recovery receipt records intent only.",
      "No project files are deleted, overwritten, merged, pushed, or published by this operation.",
    ],
  };
  const statePath = localForgeStatePath(input.dataDir);
  if (!input.accept) return { accepted: false, statePath, recovery };
  const state = readLocalForgeState(input.dataDir);
  state.worktrees[worktree.worktreeId] = state.worktrees[worktree.worktreeId] ?? worktree;
  state.recoveries[recovery.recoveryId] = recovery;
  if (input.claimId && state.claims[input.claimId]) {
    state.claims[input.claimId] = {
      ...state.claims[input.claimId],
      status: input.action === "abandon" ? "abandoned" : input.action === "recover" ? "recovered" : input.action === "review" ? "review" : state.claims[input.claimId].status,
      heartbeatAt: now,
    };
  }
  state.updatedAt = now;
  appendLocalForgeAudit(state, "recovery.recorded", recovery.recoveryId, now);
  writeLocalForgeState(state, input.dataDir);
  return { accepted: true, statePath, recovery };
}

function managedAgentsContent(manifest: ClawProjectManifest): string {
  return `# ${manifest.title}\n\nThis folder is a Claw Project primary folder.\n\n- Project id: \`${manifest.projectId}\`\n- Manifest: \`claw.project.json\`\n- This folder is not a full Workspace root unless it also contains a complete \`.claw/\` workspace.\n- Folder location does not grant authority. Access is governed by Claw grants, scopes, and restrictions.\n- Do not paste secrets, tokens, credentials, or sensitive memory into this file.\n\nUse \`claw project inspect --project . --json\` to inspect the current attachment state.\n`;
}

function managedClaudeContent(): string {
  return "# CLAUDE.md\n\nRead `AGENTS.md` first and treat it as canonical for this project folder.\n";
}

function writeAction(filePath: string, content: string): "create" | "update" | "unchanged" {
  if (!fs.existsSync(filePath)) return "create";
  return readTextSafe(filePath) === content ? "unchanged" : "update";
}

export function inspectProjectFolder(projectRoot: string, options: { workspaceId?: string } = {}): ClawProjectFolderInspection {
  const resolved = path.resolve(projectRoot);
  const manifestPath = path.join(resolved, PROJECT_CONFIG_FILE);
  const raw = safeReadJson<unknown>(manifestPath);
  let manifest: ClawProjectManifest | null = null;
  const warnings: string[] = [];
  if (raw) {
    try {
      manifest = normalizeClawProjectManifest(raw, path.basename(resolved));
    } catch {
      warnings.push("invalid_claw_project_manifest");
    }
  }
  const agentsPath = path.join(resolved, "AGENTS.md");
  const claudePath = path.join(resolved, "CLAUDE.md");
  const agentsText = readTextSafe(agentsPath);
  const claudeText = readTextSafe(claudePath);
  const exists = fs.existsSync(resolved);
  const hasWorkspaceDirectory = fs.existsSync(path.join(resolved, ".claw"));
  if (hasWorkspaceDirectory) warnings.push("folder_contains_workspace_claw_directory");
  if (!manifest) warnings.push("missing_claw_project_manifest");
  if (manifest?.primaryFolder.path !== ".") warnings.push("primary_folder_path_should_be_relative_dot");
  const manifestWorkspaceId = manifest?.attachment.workspaceId ?? manifest?.workspaceBinding?.workspaceId;
  const isDuplicate = Boolean(
    options.workspaceId
      && manifest?.attachment.state === "attached"
      && manifestWorkspaceId
      && manifestWorkspaceId !== options.workspaceId,
  );
  if (isDuplicate) warnings.push("duplicate_project_id_attached_to_different_workspace");
  return {
    projectRoot: resolved,
    manifestPath,
    manifest,
    exists,
    hasWorkspaceDirectory,
    agentsPath,
    claudePath,
    agentsManaged: Boolean(agentsText?.includes("This folder is a Claw Project primary folder.")),
    claudeShim: Boolean(claudeText?.includes("Read `AGENTS.md` first")),
    versionHistory: versionHistoryPreview(resolved),
    state: !exists ? "missing" : !manifest ? "unattached" : isDuplicate ? "duplicate" : manifest.attachment.state,
    warnings,
  };
}

export async function attachProjectFolder(input: {
  projectRoot: string;
  workspaceId: string;
  projectId?: string;
  name?: string;
  title?: string;
  accept?: boolean;
  replaceDuplicate?: boolean;
  seed?: Record<string, unknown>;
}): Promise<ClawProjectAttachPreview> {
  const projectRoot = path.resolve(input.projectRoot);
  const now = new Date().toISOString();
  const previous = safeReadJson<unknown>(path.join(projectRoot, PROJECT_CONFIG_FILE));
  const previousRecordOnDisk = previous && typeof previous === "object" && !Array.isArray(previous)
    ? previous as Record<string, unknown>
    : {};
  const seedRecord = input.seed && typeof input.seed === "object" && !Array.isArray(input.seed)
    ? input.seed
    : {};
  const previousRecord = {
    ...previousRecordOnDisk,
    ...seedRecord,
  };
  const previousAttachment = previousRecord.attachment && typeof previousRecord.attachment === "object" && !Array.isArray(previousRecord.attachment)
    ? previousRecord.attachment as Record<string, unknown>
    : {};
  const previousWorkspaceBinding = previousRecord.workspaceBinding && typeof previousRecord.workspaceBinding === "object" && !Array.isArray(previousRecord.workspaceBinding)
    ? previousRecord.workspaceBinding as Record<string, unknown>
    : {};
  const previousWorkspaceId = typeof previousAttachment.workspaceId === "string"
    ? previousAttachment.workspaceId
    : typeof previousWorkspaceBinding.workspaceId === "string"
      ? previousWorkspaceBinding.workspaceId
      : undefined;
  const requestedProjectId = input.projectId ?? (typeof previousRecord.projectId === "string" ? previousRecord.projectId : undefined) ?? createClawProjectId(input.name ?? path.basename(projectRoot));
  const duplicateAttachedProject = Boolean(
    previousWorkspaceId
      && previousWorkspaceId !== input.workspaceId
      && typeof previousRecord.projectId === "string"
      && previousRecord.projectId === requestedProjectId
      && previousAttachment.state === "attached"
      && !input.replaceDuplicate,
  );
  const manifest = normalizeClawProjectManifest({
    ...previousRecord,
    projectId: requestedProjectId,
    name: input.name ?? (typeof previousRecord.name === "string" ? previousRecord.name : undefined) ?? createClawProjectId(path.basename(projectRoot)),
    title: input.title ?? (typeof previousRecord.title === "string" ? previousRecord.title : undefined) ?? input.name ?? path.basename(projectRoot),
    primaryFolder: { id: "primary", path: ".", role: "primary" },
    workspaceBinding: duplicateAttachedProject ? undefined : { workspaceId: input.workspaceId },
    attachment: duplicateAttachedProject
      ? { state: "detached", detachedReason: "duplicate_project_id_attached_to_different_workspace" }
      : { state: "attached", workspaceId: input.workspaceId },
    updatedAt: now,
  }, path.basename(projectRoot), now);
  const manifestPath = path.join(projectRoot, PROJECT_CONFIG_FILE);
  const agentsPath = path.join(projectRoot, "AGENTS.md");
  const claudePath = path.join(projectRoot, "CLAUDE.md");
  const writes = [
    { path: manifestPath, action: writeAction(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`) },
    { path: agentsPath, action: writeAction(agentsPath, managedAgentsContent(manifest)) },
    { path: claudePath, action: writeAction(claudePath, managedClaudeContent()) },
  ];
  const warnings = [
    ...(fs.existsSync(path.join(projectRoot, ".claw")) ? ["folder_contains_workspace_claw_directory"] : []),
    ...(duplicateAttachedProject ? ["duplicate_project_id_attached_to_different_workspace"] : []),
    ...findClawProjectManifestPortabilityViolations(manifest).map((field) => `non_portable_manifest_path:${field}`),
  ];
  if (input.accept) {
    await fsp.mkdir(projectRoot, { recursive: true });
    await writeJsonFile(manifestPath, manifest);
    await writeTextFile(agentsPath, managedAgentsContent(manifest));
    await writeTextFile(claudePath, managedClaudeContent());
  }
  return {
    projectRoot,
    manifestPath,
    projectId: manifest.projectId,
    workspaceId: input.workspaceId,
    writes,
    versionHistory: versionHistoryPreview(projectRoot),
    warnings,
    accepted: Boolean(input.accept),
    manifest,
  };
}

export async function importProjectHandoff(input: {
  handoffPath: string;
  projectRoot: string;
  workspaceId: string;
  accept?: boolean;
  replaceDuplicate?: boolean;
}): Promise<ClawProjectImportPreview> {
  const handoffPath = path.resolve(input.handoffPath);
  const raw = safeReadJson<unknown>(handoffPath);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`Missing or invalid project handoff at ${handoffPath}.`);
  const handoff = raw as Record<string, unknown>;
  if (handoff.kind !== "claw.project.handoff") throw new Error(`Unsupported project handoff kind at ${handoffPath}.`);
  const safety = assertSafeClawProjectHandoff(handoff);
  if (!safety.safe) throw new Error(`Unsafe handoff fields: ${safety.blockedFields.join(", ")}`);
  const project = handoff.project && typeof handoff.project === "object" && !Array.isArray(handoff.project)
    ? handoff.project as Record<string, unknown>
    : {};
  const projectRoot = path.resolve(input.projectRoot);
  const fallbackName = path.basename(projectRoot);
  const importedManifest = normalizeClawProjectManifest({
    schemaVersion: 1,
    manifestKind: "claw.project",
    projectId: typeof project.projectId === "string" && project.projectId.trim() ? project.projectId : createClawProjectId(fallbackName),
    name: typeof project.name === "string" && project.name.trim() ? project.name : createClawProjectId(fallbackName),
    title: typeof project.title === "string" && project.title.trim() ? project.title : fallbackName,
    type: typeof project.type === "string" ? project.type : "project",
    primaryFolder: { id: "primary", path: ".", role: "primary" },
    folderRefs: Array.isArray(project.folderRefs) ? project.folderRefs : [],
    attachment: { state: "detached", detachedReason: "imported_handoff" },
    workspaceBinding: undefined,
    directories: {},
    resources: {},
  }, fallbackName);
  const preview = await attachProjectFolder({
    projectRoot,
    workspaceId: input.workspaceId,
    projectId: importedManifest.projectId,
    name: importedManifest.name,
    title: importedManifest.title,
    accept: input.accept,
    replaceDuplicate: input.replaceDuplicate,
    seed: importedManifest as unknown as Record<string, unknown>,
  });
  return {
    ...preview,
    handoffPath,
    handoffKind: "claw.project.handoff",
  };
}

export async function detachProjectFolder(projectRoot: string, reason = "detached_by_user"): Promise<ClawProjectManifest> {
  const resolved = path.resolve(projectRoot);
  const current = readProjectConfig(resolved);
  if (!current) throw new Error(`Missing or invalid ${PROJECT_CONFIG_FILE} at ${resolved}.`);
  const manifest = normalizeClawProjectManifest({
    ...current,
    attachment: { state: "detached", detachedReason: reason },
    workspaceBinding: undefined,
  }, path.basename(resolved));
  await writeJsonFile(path.join(resolved, PROJECT_CONFIG_FILE), manifest);
  return manifest;
}

export async function syncProjectHandoff(projectRoot: string): Promise<{ projectRoot: string; writes: Array<{ path: string; action: "create" | "update" | "unchanged" }> }> {
  const resolved = path.resolve(projectRoot);
  const manifest = readProjectConfig(resolved);
  if (!manifest) throw new Error(`Missing or invalid ${PROJECT_CONFIG_FILE} at ${resolved}.`);
  const normalized = normalizeClawProjectManifest(manifest, path.basename(resolved));
  const agentsPath = path.join(resolved, "AGENTS.md");
  const claudePath = path.join(resolved, "CLAUDE.md");
  const writes = [
    { path: agentsPath, action: writeAction(agentsPath, managedAgentsContent(normalized)) },
    { path: claudePath, action: writeAction(claudePath, managedClaudeContent()) },
  ];
  await writeTextFile(agentsPath, managedAgentsContent(normalized));
  await writeTextFile(claudePath, managedClaudeContent());
  return { projectRoot: resolved, writes };
}

export async function exportProjectHandoff(projectRoot: string, outputPath?: string, review?: { approvalId: string; legalLabel: string }): Promise<Record<string, unknown>> {
  const approvalId = review?.approvalId?.trim() ?? "";
  const legalLabel = review?.legalLabel?.trim() ?? "";
  const policy = evaluateRegulatedAction({
    regulatedDomain: "identity",
    decisionEffect: "external_action",
    requestedUse: "non_final_draft",
    externalAction: true,
    sensitiveExport: true,
    policyConfig: {
      confirmed: Boolean(approvalId && legalLabel),
      approvalId,
      legalLabel,
      materialConsent: Boolean(approvalId && legalLabel),
      destinationAuthorized: Boolean(approvalId && legalLabel),
    },
  });
  if (policy.policyDecision === "block") throw new Error(`Project export is blocked by regulated safety policy: ${policy.reasonCodes.join(", ") || "blocked"}.`);
  if (!policy.allowed && !approvalId) throw new Error("Project export requires explicit approvalId before export/share.");
  if (!policy.allowed && !legalLabel) throw new Error("Project export requires a persistent legalLabel before export/share.");
  if (!policy.allowed) throw new Error(`Project export requires policy confirmation before export/share: ${policy.requirements.join(", ")}.`);
  const resolved = path.resolve(projectRoot);
  const inspection = inspectProjectFolder(resolved);
  if (!inspection.manifest) throw new Error(`Missing or invalid ${PROJECT_CONFIG_FILE} at ${resolved}.`);
  const handoff = {
    schemaVersion: 1,
    kind: "claw.project.handoff",
    exportedAt: new Date().toISOString(),
    project: {
      projectId: inspection.manifest.projectId,
      name: inspection.manifest.name,
      title: inspection.manifest.title,
      type: inspection.manifest.type,
      attachmentState: inspection.manifest.attachment.state,
      primaryFolder: inspection.manifest.primaryFolder,
      folderRefs: inspection.manifest.folderRefs,
    },
    files: {
      manifest: PROJECT_CONFIG_FILE,
      agents: fs.existsSync(inspection.agentsPath),
      claude: fs.existsSync(inspection.claudePath),
    },
    safety: {
      includesSecrets: false,
      includesSensitiveMemory: false,
      folderLocationGrantsAuthority: false,
    },
    legal: {
      approvalId,
      legalLabel,
      exportKind: "project.handoff",
      policy: {
        decision: policy.policyDecision,
        reasonCodes: policy.reasonCodes,
        requirements: policy.requirements,
        outputLabels: policy.outputLabels,
        disclaimerPolicy: policy.disclaimerPolicy,
        auditPolicy: policy.auditPolicy,
        policyApplied: policy.policyApplied,
      },
    },
  };
  const safety = assertSafeClawProjectHandoff(handoff);
  if (!safety.safe) throw new Error(`Unsafe handoff fields: ${safety.blockedFields.join(", ")}`);
  if (outputPath) {
    const absoluteOutput = path.resolve(process.cwd(), outputPath);
    await writeJsonFile(absoluteOutput, handoff);
  }
  return handoff;
}
