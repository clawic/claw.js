export type ClawStoragePlatform = "darwin" | "linux" | "win32";
export type CodexPathOperation = "read" | "mirror" | "index" | "write" | "delete" | "move";

export interface ClawStorageRootsInput {
  homeDir: string;
  platform?: ClawStoragePlatform;
  xdgDataHome?: string;
  appDataDir?: string;
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

export function resolveClawGlobalDataDir(input: ClawStorageRootsInput): string {
  return joinPath(input.homeDir, ".claw");
}

export function resolveClawWorkspaceDir(workspaceRoot: string): string {
  return joinPath(workspaceRoot, ".claw");
}

export function resolveClawHostStateDir(input: ClawStorageRootsInput & { hostName: string }): string {
  if (input.hostName.toLowerCase() === "clawix") return joinPath(input.homeDir, ".clawix");
  const platform = input.platform ?? "darwin";
  if (platform === "darwin") return joinPath(input.homeDir, "Library", "Application Support", input.hostName);
  if (platform === "win32") return joinPath(input.appDataDir ?? joinPath(input.homeDir, "AppData", "Roaming"), input.hostName);
  return joinPath(input.xdgDataHome ?? joinPath(input.homeDir, ".local", "share"), input.hostName);
}

export function resolveClawHostRegistryPath(input: ClawStorageRootsInput): string {
  return joinPath(resolveClawGlobalDataDir(input), "state", "hosts", "registry.json");
}

export function isInsideCodexHome(pathname: string, homeDir: string): boolean {
  const target = resolvePathLike(pathname);
  const codexRoot = joinPath(homeDir, ".codex");
  return target === codexRoot || target.startsWith(`${codexRoot}/`);
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
  const agentsPath = joinPath(input.homeDir, ".codex", "AGENTS.md");
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
    rootDir: joinPath(homeDir, ".codex"),
    allowedOperations: ["read", "mirror", "index"],
    writePolicy: "agents_md_opt_in_only",
  };
}
