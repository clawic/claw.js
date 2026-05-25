import path from "path";

import type {
  ModelsObservedState,
  ObservedDomain,
  PluginsObservedState,
  RuntimeObservedState,
  SessionsObservedState,
} from "@clawjs/core";

import { NodeFileSystemHost, resolveFileLockPath } from "../host/filesystem.ts";
import { resolveClawWorkspaceSurfacePath } from "../surface-paths.ts";

export type ObservedStateByDomain = {
  runtime: RuntimeObservedState;
  workspace: unknown;
  models: ModelsObservedState;
  providers: unknown;
  channels: unknown;
  skills: unknown;
  plugins: PluginsObservedState;
  memory: unknown;
  scheduler: unknown;
  sessions: SessionsObservedState;
};

export const OBSERVED_DOMAINS: ObservedDomain[] = [
  "runtime",
  "workspace",
  "models",
  "providers",
  "channels",
  "skills",
  "plugins",
  "memory",
  "scheduler",
  "sessions",
];

function nowIso(): string {
  return new Date().toISOString();
}

function writeJsonFile(filePath: string, payload: unknown, filesystem = new NodeFileSystemHost()): void {
  filesystem.withLockRetry(resolveFileLockPath(filePath), () => {
    filesystem.writeTextAtomic(filePath, `${JSON.stringify(payload, null, 2)}\n`);
  });
}

function readJsonFile<T>(filePath: string, filesystem = new NodeFileSystemHost()): T | null {
  let raw: string;
  try {
    raw = filesystem.readText(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      return null;
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to read observed JSON at ${filePath}: ${message}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid observed JSON at ${filePath}: ${message}`);
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Invalid observed JSON at ${filePath}: expected an object`);
  }

  return parsed as T;
}

export function resolveObservedDir(workspaceDir: string): string {
  return resolveClawWorkspaceSurfacePath("claw.workspace.observedState", workspaceDir);
}

export function resolveObservedDomainPath(workspaceDir: string, domain: ObservedDomain): string {
  return path.join(resolveObservedDir(workspaceDir), `${domain}.json`);
}

export function readObservedDomain<TDomain extends ObservedDomain>(
  workspaceDir: string,
  domain: TDomain,
  filesystem = new NodeFileSystemHost(),
): ObservedStateByDomain[TDomain] | null {
  return readJsonFile<ObservedStateByDomain[TDomain]>(resolveObservedDomainPath(workspaceDir, domain), filesystem);
}

export function writeObservedDomain<TDomain extends ObservedDomain>(
  workspaceDir: string,
  domain: TDomain,
  value: Record<string, unknown>,
  filesystem = new NodeFileSystemHost(),
): ObservedStateByDomain[TDomain] {
  const filePath = resolveObservedDomainPath(workspaceDir, domain);
  filesystem.ensureDir(path.dirname(filePath));
  const next = {
    schemaVersion: 1,
    updatedAt: nowIso(),
    ...value,
  } as ObservedStateByDomain[TDomain];
  writeJsonFile(filePath, next, filesystem);
  return next;
}

export function readAllObservedDomains(workspaceDir: string, filesystem = new NodeFileSystemHost()): Partial<ObservedStateByDomain> {
  return Object.fromEntries(
    OBSERVED_DOMAINS
      .map((domain) => [domain, readObservedDomain(workspaceDir, domain, filesystem)] as const)
      .filter(([, value]) => value !== null),
  ) as Partial<ObservedStateByDomain>;
}
