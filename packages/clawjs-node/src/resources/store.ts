import fs from "fs";
import path from "path";
import crypto from "crypto";

import {
  resourceRegistryStateSchema,
  type ResourceKind,
  type ResourceRecord,
  type ResourceRegisterInput,
  type ResourceRegistryState,
  type ResourceStatus,
} from "@clawjs/core";

import { NodeFileSystemHost, resolveFileLockPath } from "../host/filesystem.ts";
import { resolveClawGlobalSurfacePath } from "../surface-paths.ts";

export const RESOURCES_STATE_FILE = "resources.json";

export interface ResourceRegistryStoreOptions {
  rootDir?: string;
  filesystem?: NodeFileSystemHost;
  env?: NodeJS.ProcessEnv;
}

export interface ResourceReadResult {
  resource: ResourceRecord;
  content?: string;
  truncated?: boolean;
  error?: string;
}

export function resolveResourceRegistryRoot(options: ResourceRegistryStoreOptions = {}): string {
  const configured = options.rootDir?.trim()
    || options.env?.CLAW_RESOURCES_DIR?.trim()
    || process.env.CLAW_RESOURCES_DIR?.trim();
  if (configured) return expandHome(configured);
  return resolveClawGlobalSurfacePath("claw.global.resources", options.env);
}

export class LocalResourceRegistryStore {
  readonly rootDir: string;
  private readonly filesystem: NodeFileSystemHost;

  constructor(options: ResourceRegistryStoreOptions = {}) {
    this.rootDir = resolveResourceRegistryRoot(options);
    this.filesystem = options.filesystem ?? new NodeFileSystemHost();
  }

  statePath(): string {
    return path.join(this.rootDir, RESOURCES_STATE_FILE);
  }

  readState(): ResourceRegistryState {
    try {
      const parsed = resourceRegistryStateSchema.safeParse(JSON.parse(this.filesystem.readText(this.statePath())));
      if (parsed.success) return parsed.data as ResourceRegistryState;
    } catch {
      // Empty state.
    }
    return { schemaVersion: 1, resources: [], updatedAt: nowIso() };
  }

  writeState(state: ResourceRegistryState): ResourceRegistryState {
    const next: ResourceRegistryState = {
      schemaVersion: 1,
      resources: [...state.resources].sort((left, right) => left.id.localeCompare(right.id)),
      updatedAt: nowIso(),
    };
    this.filesystem.ensureDir(this.rootDir);
    this.filesystem.withLockRetry(resolveFileLockPath(this.statePath()), () => {
      this.filesystem.writeTextAtomic(this.statePath(), `${JSON.stringify(next, null, 2)}\n`);
    });
    return next;
  }

  list(options: { status?: ResourceStatus; kind?: ResourceKind } = {}): ResourceRecord[] {
    return this.readState().resources
      .map((resource) => this.refreshStatus(resource))
      .filter((resource) => !options.status || resource.status === options.status)
      .filter((resource) => !options.kind || resource.kind === options.kind);
  }

  get(id: string): ResourceRecord | null {
    const resource = this.readState().resources.find((entry) => entry.id === id) ?? null;
    return resource ? this.refreshStatus(resource) : null;
  }

  register(input: ResourceRegisterInput): ResourceRecord {
    const state = this.readState();
    const now = nowIso();
    const id = input.id ?? createResourceId();
    if (!/^res_[a-z0-9]+$/.test(id)) throw new Error(`Invalid resource id: ${id}`);
    const current = state.resources.find((entry) => entry.id === id);
    const status = resolveResourceStatus(input.locator.value, input.locator.kind);
    const resource: ResourceRecord = {
      schemaVersion: 1,
      id,
      kind: input.kind ?? inferResourceKind(input.locator.kind, input.locator.value),
      status,
      locator: input.locator,
      scope: input.scope ?? current?.scope ?? {},
      ...(input.label ? { label: input.label } : current?.label ? { label: current.label } : {}),
      fingerprint: input.fingerprint ?? fingerprintPath(input.locator.value, input.locator.kind) ?? current?.fingerprint,
      ...(input.bookmark ? { bookmark: input.bookmark } : current?.bookmark ? { bookmark: current.bookmark } : {}),
      ...(input.fileIdentity ? { fileIdentity: input.fileIdentity } : current?.fileIdentity ? { fileIdentity: current.fileIdentity } : {}),
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
      ...(status === "active" ? { lastSeenAt: now } : { missingSince: current?.missingSince ?? now }),
    };
    this.writeState({ ...state, resources: [...state.resources.filter((entry) => entry.id !== id), resource] });
    return resource;
  }

  resolve(id: string): ResourceRecord {
    const resource = this.get(id);
    if (!resource) throw new Error(`Resource not found: ${id}`);
    return resource;
  }

  status(id: string): ResourceRecord {
    const state = this.readState();
    const resource = state.resources.find((entry) => entry.id === id);
    if (!resource) throw new Error(`Resource not found: ${id}`);
    const next = this.refreshStatus(resource);
    if (next.status !== resource.status || next.lastSeenAt !== resource.lastSeenAt || next.missingSince !== resource.missingSince) {
      this.writeState({ ...state, resources: state.resources.map((entry) => entry.id === id ? next : entry) });
    }
    return next;
  }

  read(id: string, options: { maxBytes?: number } = {}): ResourceReadResult {
    const resource = this.status(id);
    if (resource.locator.kind !== "path") {
      return { resource, error: `Resource ${id} is not a readable filesystem path.` };
    }
    if (resource.kind === "directory") {
      return { resource, error: `Resource ${id} is a directory.` };
    }
    const maxBytes = Math.max(1, options.maxBytes ?? 64_000);
    const buffer = fs.readFileSync(expandHome(resource.locator.value));
    return {
      resource,
      content: buffer.subarray(0, maxBytes).toString("utf8"),
      truncated: buffer.length > maxBytes,
    };
  }

  private refreshStatus(resource: ResourceRecord): ResourceRecord {
    const status = resolveResourceStatus(resource.locator.value, resource.locator.kind);
    const now = nowIso();
    if (status === resource.status) {
      return status === "active" ? { ...resource, lastSeenAt: resource.lastSeenAt ?? now } : resource;
    }
    return {
      ...resource,
      status,
      updatedAt: now,
      ...(status === "active" ? { lastSeenAt: now, missingSince: undefined } : { missingSince: resource.missingSince ?? now }),
    };
  }
}

export function createLocalResourceRegistryStore(options: ResourceRegistryStoreOptions = {}): LocalResourceRegistryStore {
  return new LocalResourceRegistryStore(options);
}

function createResourceId(): string {
  return `res_${crypto.randomBytes(12).toString("base64url").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 18)}`;
}

function inferResourceKind(locatorKind: ResourceRegisterInput["locator"]["kind"], value: string): ResourceKind {
  if (locatorKind === "secret-ref") return "secret-ref";
  if (locatorKind === "hostname" || locatorKind === "url") return "server";
  if (locatorKind === "path") {
    try {
      return fs.statSync(expandHome(value)).isDirectory() ? "directory" : "file";
    } catch {
      return "file";
    }
  }
  return "other";
}

function resolveResourceStatus(value: string, kind: ResourceRegisterInput["locator"]["kind"]): ResourceStatus {
  if (kind !== "path") return "active";
  return fs.existsSync(expandHome(value)) ? "active" : "missing";
}

function fingerprintPath(value: string, kind: ResourceRegisterInput["locator"]["kind"]): string | undefined {
  if (kind !== "path") return undefined;
  try {
    const stat = fs.statSync(expandHome(value));
    return crypto.createHash("sha256").update(`${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}`).digest("hex");
  } catch {
    return undefined;
  }
}

function expandHome(value: string): string {
  if (value === "~") return process.env.HOME ?? value;
  if (value.startsWith("~/")) return path.join(process.env.HOME ?? "", value.slice(2));
  return value;
}

function nowIso(): string {
  return new Date().toISOString();
}
