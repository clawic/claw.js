import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { CLI_EXIT_OK, CLI_EXIT_USAGE, CliHandledError } from "./cli-errors.ts";
import { formatCliTable } from "./cli-flag-parsers.ts";
import { writeCommandJsonOk } from "./cli-json.ts";

type ModuleKind = "capability" | "area";
type ModuleState = "available" | "visible" | "enabled" | "configured" | "running" | "permissioned";
type SetupModeId = "minimal" | "normal" | "advanced";

interface ClawModuleDefinition {
  id: string;
  kind: ModuleKind;
  label: string;
  summary: string;
  defaultModes: SetupModeId[];
  niche?: boolean;
  requiresExplicitInstall?: boolean;
  impact: string[];
}

interface ClawModulesConfig {
  schemaVersion: 1;
  mode: SetupModeId;
  enabledModules: string[];
  disabledModules: string[];
  updatedAt: string;
}

interface SetupAdjustment {
  enable: string[];
  disable: string[];
}

interface CliContextLike {
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
  cwd: string;
}

const SETUP_MODE_IDS = new Set(["minimal", "normal", "advanced"]);

const MODULE_DEFINITIONS: ClawModuleDefinition[] = [
  {
    id: "local-data",
    kind: "capability",
    label: "Local data",
    summary: "Local core.sqlite records created only when data commands need them.",
    defaultModes: ["minimal", "normal", "advanced"],
    impact: ["local_write_on_use"],
  },
  {
    id: "light-search",
    kind: "capability",
    label: "Light search",
    summary: "Lightweight local lexical search and deterministic discovery.",
    defaultModes: ["normal", "advanced"],
    impact: ["local_read", "rebuildable_index_on_use"],
  },
  {
    id: "dev-diagnostics",
    kind: "capability",
    label: "Developer diagnostics",
    summary: "Inspect, diagnostics, API and runtime/developer surfaces available on demand.",
    defaultModes: ["advanced"],
    impact: ["local_read", "on_demand_tools"],
  },
  {
    id: "host",
    kind: "capability",
    label: "Host",
    summary: "Signed-host integration for native actions, kept on demand by default.",
    defaultModes: [],
    requiresExplicitInstall: true,
    impact: ["signed_host", "permissions_possible", "process_possible"],
  },
  {
    id: "audio-voice",
    kind: "capability",
    label: "Audio and voice",
    summary: "Audio catalog, TTS, STT and transcription capabilities.",
    defaultModes: [],
    requiresExplicitInstall: true,
    impact: ["microphone_possible", "model_or_provider_possible", "local_files"],
  },
  {
    id: "integrations",
    kind: "capability",
    label: "External integrations",
    summary: "Connector/provider integrations such as mail, calendars, drives, chat and APIs.",
    defaultModes: [],
    requiresExplicitInstall: true,
    impact: ["network_possible", "auth_required", "provider_policy"],
  },
  {
    id: "sync-remote",
    kind: "capability",
    label: "Sync and remote",
    summary: "Remote gateway, sync, nodes and mesh capabilities.",
    defaultModes: [],
    requiresExplicitInstall: true,
    impact: ["network_possible", "host_possible", "process_possible"],
  },
  {
    id: "basic-productivity",
    kind: "area",
    label: "Basic productivity",
    summary: "Tasks, notes, simple projects and people/contacts.",
    defaultModes: ["normal", "advanced"],
    impact: ["local_data"],
  },
  {
    id: "personal-finance",
    kind: "area",
    label: "Personal finance",
    summary: "Personal budgets, transactions and finance records.",
    defaultModes: [],
    impact: ["sensitive_area", "local_data"],
  },
  {
    id: "crm",
    kind: "area",
    label: "CRM",
    summary: "Customer, lead and relationship records.",
    defaultModes: [],
    impact: ["business_area", "local_data"],
  },
  {
    id: "erp",
    kind: "area",
    label: "ERP",
    summary: "Specialized enterprise resource planning domain.",
    defaultModes: [],
    niche: true,
    requiresExplicitInstall: true,
    impact: ["niche_area", "optional_pack"],
  },
  {
    id: "health",
    kind: "area",
    label: "Health",
    summary: "Sensitive health and wellbeing records.",
    defaultModes: [],
    niche: true,
    impact: ["sensitive_area", "requires_care"],
  },
  {
    id: "legal",
    kind: "area",
    label: "Legal",
    summary: "Sensitive legal documents and case records.",
    defaultModes: [],
    niche: true,
    impact: ["sensitive_area", "requires_care"],
  },
  {
    id: "labs-pharma",
    kind: "area",
    label: "Labs and pharma",
    summary: "Specialized lab, pharma and research domains.",
    defaultModes: [],
    niche: true,
    requiresExplicitInstall: true,
    impact: ["niche_area", "sensitive_area", "optional_pack"],
  },
  {
    id: "construction",
    kind: "area",
    label: "Construction",
    summary: "Specialized construction project and site records.",
    defaultModes: [],
    niche: true,
    requiresExplicitInstall: true,
    impact: ["niche_area", "optional_pack"],
  },
  {
    id: "iot",
    kind: "area",
    label: "IoT",
    summary: "Home/device automation and technical IoT records.",
    defaultModes: [],
    niche: true,
    requiresExplicitInstall: true,
    impact: ["niche_area", "network_possible", "device_control_possible"],
  },
];

const MODULE_COLLECTION_FAMILIES: Record<string, string[]> = {
  crm: ["crm", "customer_intake"],
  erp: ["billing", "commerce", "manufacturing", "procurement", "supply_chain", "warehouse"],
  health: ["fitness", "health", "mental_health_recovery", "personal_care_aesthetics", "pregnancy_early_childhood", "reproductive_intimate"],
  legal: ["compliance", "government", "legal"],
  "labs-pharma": ["biology", "eln", "labs", "pharma", "research"],
  construction: ["construction"],
  iot: ["iot"],
  "personal-finance": ["finance"],
};

export const MINIMAL_SAFE_COLLECTION_NAMES = new Set(["tasks"]);

export const BASIC_PRODUCTIVITY_COLLECTION_NAMES = new Set([
  "tasks",
  "notes",
  "projects",
  "people",
]);

function clawHome(flags: Record<string, string>): string {
  return path.resolve(flags["claw-home"] ? flags["claw-home"].replace(/^~(?=$|\/)/, os.homedir()) : process.env.CLAW_HOME ?? path.join(os.homedir(), ".claw"));
}

function globalConfigPath(flags: Record<string, string>): string {
  return path.join(clawHome(flags), "config", "modules.json");
}

function workspaceConfigPath(flags: Record<string, string>, cwd: string): string {
  return path.join(path.resolve(cwd, flags.workspace ?? "."), ".claw", "config", "modules.json");
}

function defaultConfig(mode: SetupModeId = "minimal"): ClawModulesConfig {
  return {
    schemaVersion: 1,
    mode,
    enabledModules: [],
    disabledModules: [],
    updatedAt: new Date().toISOString(),
  };
}

function readConfig(filePath: string): ClawModulesConfig | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as Partial<ClawModulesConfig>;
    if (parsed.schemaVersion !== 1 || !SETUP_MODE_IDS.has(parsed.mode ?? "")) return null;
    return {
      schemaVersion: 1,
      mode: parsed.mode as SetupModeId,
      enabledModules: Array.isArray(parsed.enabledModules) ? parsed.enabledModules.filter((entry): entry is string => typeof entry === "string") : [],
      disabledModules: Array.isArray(parsed.disabledModules) ? parsed.disabledModules.filter((entry): entry is string => typeof entry === "string") : [],
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function writeConfig(filePath: string, config: ClawModulesConfig): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify({ ...config, updatedAt: new Date().toISOString() }, null, 2)}\n`);
}

export function hasModuleConfigForCli(flags: Record<string, string>, cwd: string): boolean {
  return fs.existsSync(globalConfigPath(flags)) || fs.existsSync(workspaceConfigPath(flags, cwd));
}

function mergeConfig(globalConfig: ClawModulesConfig | null, workspaceConfig: ClawModulesConfig | null): ClawModulesConfig {
  const base = globalConfig ?? defaultConfig("minimal");
  if (!workspaceConfig) return base;
  return {
    schemaVersion: 1,
    mode: workspaceConfig.mode ?? base.mode,
    enabledModules: [...new Set([...base.enabledModules, ...workspaceConfig.enabledModules])],
    disabledModules: [...new Set([...base.disabledModules, ...workspaceConfig.disabledModules])],
    updatedAt: workspaceConfig.updatedAt,
  };
}

function modulesForMode(mode: SetupModeId): Set<string> {
  return new Set(MODULE_DEFINITIONS.filter((module) => module.defaultModes.includes(mode)).map((module) => module.id));
}

function effectiveModuleStates(config: ClawModulesConfig, options: { includeAvailable?: boolean } = {}): Array<ClawModuleDefinition & { state: ModuleState }> {
  const modeModules = modulesForMode(config.mode);
  const enabled = new Set([...modeModules, ...config.enabledModules]);
  for (const disabled of config.disabledModules) enabled.delete(disabled);
  return MODULE_DEFINITIONS
    .filter((module) => options.includeAvailable || enabled.has(module.id) || module.defaultModes.includes(config.mode))
    .map((module) => ({
      ...module,
      state: enabled.has(module.id) ? "enabled" : module.niche ? "available" : "visible",
    }));
}

export function readEffectiveModuleConfigForCli(flags: Record<string, string>, cwd: string): ClawModulesConfig {
  return mergeConfig(readConfig(globalConfigPath(flags)), readConfig(workspaceConfigPath(flags, cwd)));
}

export function enabledModuleIdsForConfig(config: ClawModulesConfig): Set<string> {
  const enabled = modulesForMode(config.mode);
  for (const moduleId of config.enabledModules) enabled.add(moduleId);
  for (const moduleId of config.disabledModules) enabled.delete(moduleId);
  return enabled;
}

const COMMAND_MODULE_GATES: Record<string, string> = {
  erp: "erp",
  iot: "iot",
  "iot-device": "iot",
  "iot-devices": "iot",
  thing: "iot",
  things: "iot",
  health: "health",
  patient: "health",
  patients: "health",
  legal: "legal",
  "legal-client": "legal",
  "legal-clients": "legal",
  labs: "labs-pharma",
  lab: "labs-pharma",
  pharma: "labs-pharma",
  study: "labs-pharma",
  studies: "labs-pharma",
  construction: "construction",
  "construction-project": "construction",
  "construction-projects": "construction",
  "construction-site": "construction",
  "construction-sites": "construction",
};

export function requiredModuleForCliGroup(group: string | undefined): ClawModuleDefinition | null {
  const moduleId = group ? COMMAND_MODULE_GATES[group] : undefined;
  return moduleId ? MODULE_DEFINITIONS.find((module) => module.id === moduleId) ?? null : null;
}

export function activeCollectionFilterForModules(config: ClawModulesConfig): {
  collectionNames: Set<string>;
  families: Set<string>;
} {
  const enabled = enabledModuleIdsForConfig(config);
  const collectionNames = new Set(MINIMAL_SAFE_COLLECTION_NAMES);
  const families = new Set<string>();
  if (enabled.has("basic-productivity")) {
    for (const name of BASIC_PRODUCTIVITY_COLLECTION_NAMES) collectionNames.add(name);
  }
  for (const moduleId of enabled) {
    for (const family of MODULE_COLLECTION_FAMILIES[moduleId] ?? []) families.add(family);
  }
  return { collectionNames, families };
}

function parseMode(value: string | undefined): SetupModeId {
  const mode = value ?? "minimal";
  if (!SETUP_MODE_IDS.has(mode)) {
    throw new CliHandledError("invalid_mode", "Mode must be minimal, normal, or advanced.", CLI_EXIT_USAGE);
  }
  return mode as SetupModeId;
}

function setupPreview(mode: SetupModeId, current: ClawModulesConfig | null): ClawModulesConfig {
  return {
    ...(current ?? defaultConfig(mode)),
    mode,
    updatedAt: new Date().toISOString(),
  };
}

function csvFlag(value: string | undefined): string[] {
  return value?.split(",").map((entry) => entry.trim()).filter(Boolean) ?? [];
}

function setupAdjustments(flags: Record<string, string>): SetupAdjustment {
  return {
    enable: [...csvFlag(flags.enable), ...csvFlag(flags.with)].filter((moduleId) => moduleId !== "true"),
    disable: [...csvFlag(flags.disable), ...csvFlag(flags.without)].filter((moduleId) => moduleId !== "true"),
  };
}

function validateModuleIds(moduleIds: string[], usage: string): void {
  const known = new Set(MODULE_DEFINITIONS.map((module) => module.id));
  const unknown = moduleIds.find((moduleId) => !known.has(moduleId));
  if (unknown) throw new CliHandledError("unknown_module", `${usage}. Unknown module: ${unknown}`, CLI_EXIT_USAGE);
}

function applySetupAdjustments(config: ClawModulesConfig, adjustment: SetupAdjustment): ClawModulesConfig {
  validateModuleIds([...adjustment.enable, ...adjustment.disable], "Usage: claw setup minimal|normal|advanced [--enable ids] [--disable ids]");
  const enabled = new Set(config.enabledModules);
  const disabled = new Set(config.disabledModules);
  for (const moduleId of adjustment.enable) {
    enabled.add(moduleId);
    disabled.delete(moduleId);
  }
  for (const moduleId of adjustment.disable) {
    disabled.add(moduleId);
    enabled.delete(moduleId);
  }
  return {
    ...config,
    enabledModules: [...enabled].sort(),
    disabledModules: [...disabled].sort(),
    updatedAt: new Date().toISOString(),
  };
}

function groupedModules(config: ClawModulesConfig, options: { includeAvailable?: boolean } = {}): Record<ModuleKind, Array<ClawModuleDefinition & { state: ModuleState }>> {
  const modules = effectiveModuleStates(config, options);
  return {
    capability: modules.filter((module) => module.kind === "capability"),
    area: modules.filter((module) => module.kind === "area"),
  };
}

function renderSetupText(config: ClawModulesConfig, options: { details?: boolean; binName?: string } = {}): string {
  const active = effectiveModuleStates(config);
  const gated = MODULE_DEFINITIONS.filter((module) => module.requiresExplicitInstall || module.impact.some((impact) => ["network_possible", "permissions_possible", "model_or_provider_possible", "process_possible", "device_control_possible"].includes(impact)));
  const lines = [
    `Mode preview: ${config.mode}`,
    "",
    "Active now:",
    ...active.map((module) => `  ${module.id.padEnd(18)} ${module.kind.padEnd(10)} ${module.summary}`),
    "",
    "Requires explicit action:",
    ...gated.map((module) => `  ${module.id.padEnd(18)} ${module.impact.join(", ")}`),
    "",
    "Adjust before applying with --enable id1,id2 or --disable id1,id2.",
    "Apply with --apply, or adjust later with `claw modules enable|disable <id>`.",
  ];
  if (options.details) {
    const grouped = groupedModules(config, { includeAvailable: true });
    lines.push(
      "",
      "Capabilities:",
      ...grouped.capability.map((module) => `  ${module.id.padEnd(18)} ${module.state.padEnd(10)} ${module.summary}`),
      "",
      "Areas:",
      ...grouped.area.map((module) => `  ${module.id.padEnd(18)} ${module.state.padEnd(10)} ${module.summary}`),
      "",
      `Detail menu: run \`${options.binName ?? "claw"} setup ${config.mode} --details --enable <id>\`, \`${options.binName ?? "claw"} setup ${config.mode} --details --disable <id>\`, or \`${options.binName ?? "claw"} modules status --available\`.`,
    );
  }
  return lines.join("\n");
}

function targetConfigPath(scope: "global" | "workspace", flags: Record<string, string>, context: CliContextLike): string {
  return scope === "workspace" ? workspaceConfigPath(flags, context.cwd) : globalConfigPath(flags);
}

export async function runSetupCli(input: {
  positionals: string[];
  flags: Record<string, string>;
  argv: string[];
  context: CliContextLike;
  wantsJson: boolean;
}): Promise<number> {
  const mode = parseMode(input.flags.mode ?? input.positionals[1]);
  const scope = input.flags.workspace ? "workspace" : "global";
  const pathToWrite = targetConfigPath(scope, input.flags, input.context);
  const current = readConfig(pathToWrite);
  const adjustments = setupAdjustments(input.flags);
  const preview = applySetupAdjustments(setupPreview(mode, current), adjustments);
  const modules = effectiveModuleStates(preview, { includeAvailable: true });
  const apply = input.argv.includes("--apply") || input.argv.includes("--yes");
  const details = input.argv.includes("--details") || input.argv.includes("--detail") || input.flags.details === "true" || input.flags.detail === "true";

  if (apply) writeConfig(pathToWrite, preview);

  if (input.wantsJson) {
    writeCommandJsonOk(input.context.stdout, "setup", {
      applied: apply,
      mode: preview.mode,
      scope,
      configPath: pathToWrite,
      adjustments,
      detail: details ? groupedModules(preview, { includeAvailable: true }) : undefined,
      modules,
    }, { subcommand: apply ? "apply" : "preview" });
  } else {
    input.context.stdout.write(`${renderSetupText(preview, { details })}\n`);
    if (apply) input.context.stdout.write(`\nSaved ${scope} module config: ${pathToWrite}\n`);
  }
  return CLI_EXIT_OK;
}

export async function runModulesCli(input: {
  positionals: string[];
  flags: Record<string, string>;
  argv: string[];
  context: CliContextLike;
  wantsJson: boolean;
}): Promise<number> {
  const command = input.positionals[1] ?? "list";
  const moduleId = input.positionals[2] ?? input.flags.id;
  const scope = input.flags.workspace ? "workspace" : "global";
  const globalPath = globalConfigPath(input.flags);
  const workspacePath = workspaceConfigPath(input.flags, input.context.cwd);
  const globalConfig = readConfig(globalPath);
  const workspaceConfig = readConfig(workspacePath);
  const effective = mergeConfig(globalConfig, workspaceConfig);
  const writePath = targetConfigPath(scope, input.flags, input.context);
  const writable = readConfig(writePath) ?? defaultConfig(effective.mode);

  if (command === "list" || command === "status") {
    const includeAvailable = input.argv.includes("--available") || input.flags.available === "true" || command === "status";
    const modules = effectiveModuleStates(effective, { includeAvailable });
    if (input.wantsJson) {
      writeCommandJsonOk(input.context.stdout, "modules", {
        mode: effective.mode,
        config: { globalPath, workspacePath, hasGlobalConfig: Boolean(globalConfig), hasWorkspaceConfig: Boolean(workspaceConfig) },
        modules,
      }, { subcommand: command });
    } else {
      input.context.stdout.write(`${formatCliTable(modules.map((module) => ({
        id: module.id,
        kind: module.kind,
        state: module.state,
        label: module.label,
      })))}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (command === "enable" || command === "disable") {
    if (!moduleId || !MODULE_DEFINITIONS.some((module) => module.id === moduleId)) {
      throw new CliHandledError("unknown_module", "Usage: claw modules enable|disable <module-id>", CLI_EXIT_USAGE);
    }
    const enabled = new Set(writable.enabledModules);
    const disabled = new Set(writable.disabledModules);
    if (command === "enable") {
      enabled.add(moduleId);
      disabled.delete(moduleId);
    } else {
      disabled.add(moduleId);
      enabled.delete(moduleId);
    }
    const next = {
      ...writable,
      enabledModules: [...enabled].sort(),
      disabledModules: [...disabled].sort(),
      updatedAt: new Date().toISOString(),
    };
    writeConfig(writePath, next);
    if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "modules", { scope, configPath: writePath, moduleId, state: command === "enable" ? "enabled" : "available" }, { subcommand: command });
    else input.context.stdout.write(`${command === "enable" ? "enabled" : "disabled"} ${moduleId}\n`);
    return CLI_EXIT_OK;
  }

  if (command === "install") {
    if (!moduleId || !MODULE_DEFINITIONS.some((module) => module.id === moduleId)) {
      throw new CliHandledError("unknown_module", "Usage: claw modules install <module-id>", CLI_EXIT_USAGE);
    }
    const module = MODULE_DEFINITIONS.find((entry) => entry.id === moduleId)!;
    const message = `Module ${moduleId} is available, but installation is explicit and not performed by this command yet. Review requirements, then enable or install the relevant pack.`;
    if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "modules", { installed: false, module, message, next: [`claw modules enable ${moduleId}`] }, { subcommand: "install" });
    else input.context.stdout.write(`${message}\n`);
    return CLI_EXIT_OK;
  }

  throw new CliHandledError("usage_error", "Usage: claw modules list|status|enable|disable|install", CLI_EXIT_USAGE);
}
