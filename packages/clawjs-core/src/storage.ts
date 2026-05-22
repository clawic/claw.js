import { requireMacCareRoutePathPattern } from "./mac-care.ts";

export type ClawStoragePlatform = "darwin" | "linux" | "win32";
export type CodexPathOperation = "read" | "mirror" | "index" | "write" | "delete" | "move";

export interface ClawStorageRootsInput {
  homeDir: string;
  platform?: ClawStoragePlatform;
  xdgDataHome?: string;
  appDataDir?: string;
}

export interface ClawGlobalDataStorageInput extends ClawStorageRootsInput {
  dataDir?: string;
  clawHome?: string;
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/$/, "");
}

function resolvePathLike(value: string): string {
  const normalized = normalizePath(value);
  const absolute = normalized.startsWith("/");
  const parts: string[] = [];
  for (const part of normalized.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (parts.length > 0 && parts[parts.length - 1] !== "..") {
        parts.pop();
      } else if (!absolute) {
        parts.push(part);
      }
      continue;
    }
    parts.push(part);
  }
  return `${absolute ? "/" : ""}${parts.join("/")}` || (absolute ? "/" : ".");
}

function joinPath(...parts: string[]): string {
  return resolvePathLike(parts.filter(Boolean).join("/"));
}

export function expandClawHomePath(value: string, homeDir: string): string {
  if (value === "~") return homeDir;
  if (value.startsWith("~/")) return joinPath(homeDir, value.slice(2));
  return value;
}

export function resolveClawGlobalDataDir(input: ClawStorageRootsInput): string {
  return joinPath(input.homeDir, ".claw");
}

export function resolveClawGlobalDataStorageDir(input: ClawGlobalDataStorageInput): string {
  if (input.dataDir) return resolvePathLike(expandClawHomePath(input.dataDir, input.homeDir));
  if (input.clawHome) return joinPath(expandClawHomePath(input.clawHome, input.homeDir), "data");
  return joinPath(resolveClawGlobalDataDir(input), "data");
}

export function resolveClawWorkspaceDir(workspaceRoot: string): string {
  return joinPath(workspaceRoot, ".claw");
}

export function resolveClawConfigDir(clawRoot: string): string {
  return joinPath(clawRoot, "config");
}

export function resolveClawModulesConfigPath(clawRoot: string): string {
  return joinPath(resolveClawConfigDir(clawRoot), "modules.json");
}

export function resolveClawGlobalModulesConfigPath(input: ClawStorageRootsInput): string {
  return resolveClawModulesConfigPath(resolveClawGlobalDataDir(input));
}

export function resolveClawWorkspaceModulesConfigPath(workspaceRoot: string): string {
  return resolveClawModulesConfigPath(resolveClawWorkspaceDir(workspaceRoot));
}

export function resolveClawHostStateDir(input: ClawStorageRootsInput & { hostName: string }): string {
  if (input.hostName.toLowerCase() === "clawix") return joinPath(input.homeDir, ".clawix");
  const platform = input.platform ?? "darwin";
  if (platform === "darwin") {
    const applicationSupportDir = requireMacCareRoutePathPattern("mac_care.route.application_support", { homeDir: input.homeDir });
    return joinPath(applicationSupportDir, input.hostName);
  }
  if (platform === "win32") return joinPath(input.appDataDir ?? joinPath(input.homeDir, "AppData", "Roaming"), input.hostName);
  return joinPath(input.xdgDataHome ?? joinPath(input.homeDir, ".local", "share"), input.hostName);
}

export function resolveClawHostRegistryPath(input: ClawStorageRootsInput): string {
  return joinPath(resolveClawGlobalDataDir(input), "state", "hosts", "registry.json");
}

export function isInsideCodexHome(pathname: string, homeDir: string): boolean {
  const target = resolvePathLike(pathname);
  const codexRoot = resolveCodexHomeDir(homeDir);
  return target === codexRoot || target.startsWith(`${codexRoot}/`);
}

export function resolveCodexHomeDir(homeDir: string): string {
  return joinPath(homeDir, ".codex");
}

export function resolveCodexConfigPath(homeDir: string): string {
  return joinPath(resolveCodexHomeDir(homeDir), "config.toml");
}

export function resolveCodexProjectConfigPath(projectDir: string): string {
  return joinPath(projectDir, ".codex", "config.toml");
}

export function resolveCodexSessionsDir(homeDir: string): string {
  return joinPath(resolveCodexHomeDir(homeDir), "sessions");
}

export function resolveCodexArchivedSessionsDir(homeDir: string): string {
  return joinPath(resolveCodexHomeDir(homeDir), "archived_sessions");
}

export function assertCodexReadOnlyPath(input: {
  path: string;
  homeDir: string;
  operation: CodexPathOperation;
  allowAgentsMdOptIn?: boolean;
}): void {
  if (!isInsideCodexHome(input.path, input.homeDir)) return;
  if (input.operation === "read" || input.operation === "mirror" || input.operation === "index") return;

  const normalized = resolvePathLike(input.path);
  const agentsPath = joinPath(resolveCodexHomeDir(input.homeDir), "AGENTS.md");
  if (input.operation === "write" && input.allowAgentsMdOptIn === true && normalized === agentsPath) return;

  throw new Error(`Refusing ${input.operation} operation inside ~/.codex: ${input.path}`);
}

export function createCodexReadOnlySourceDescriptor(homeDir: string): {
  id: "codex";
  rootDir: string;
  allowedOperations: Array<"read" | "mirror" | "index">;
  writePolicy: "agents_md_opt_in_only";
} {
  return {
    id: "codex",
    rootDir: resolveCodexHomeDir(homeDir),
    allowedOperations: ["read", "mirror", "index"],
    writePolicy: "agents_md_opt_in_only",
  };
}
