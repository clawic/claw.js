import fs from "fs";
import fsp from "fs/promises";
import path from "path";

import {
  assertSafeClawProjectHandoff,
  createClawProjectId,
  evaluateRegulatedAction,
  findClawProjectManifestPortabilityViolations,
  normalizeClawProjectManifest,
  resolveClawPersistentSurfacePath,
  type ClawProjectManifest,
} from "@clawjs/core";

import { createPackageName, createPascalCase, createTitle, type SupportedPackageManager } from "./scaffold.ts";

const PROJECT_CONFIG_FILE = "claw.project.json";

export type ClawProjectType = "app" | "agent" | "server" | "workspace" | "skill" | "plugin" | "project";
export type ClawResourceType = "skill" | "plugin" | "provider" | "channel" | "command";
export type ClawIntegrationType = "provider" | "channel" | "telegram" | "scheduler" | "memory" | "workspace";

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
  state: "missing" | "unattached" | "attached" | "detached" | "duplicate";
  warnings: string[];
}

export interface ClawProjectAttachPreview {
  projectRoot: string;
  manifestPath: string;
  projectId: string;
  workspaceId: string;
  writes: Array<{ path: string; action: "create" | "update" | "unchanged" }>;
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
