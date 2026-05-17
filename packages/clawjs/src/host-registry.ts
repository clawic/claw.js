import fs from "fs";
import os from "os";
import path from "path";

import {
  clawContractVersionV1,
  clawHostDescriptorSchema,
  clawHostRegistrySchema,
  resolveClawHostRegistryPath,
  type ClawHostDescriptor,
  type ClawHostRegistry,
} from "@clawjs/core";

export interface HostRegistryOptions {
  clawHome?: string;
  homeDir?: string;
  platform?: NodeJS.Platform;
}

function nowIso(): string {
  return new Date().toISOString();
}

function emptyRegistry(): ClawHostRegistry {
  return {
    schemaVersion: clawContractVersionV1,
    activeHostId: null,
    hosts: [],
    updatedAt: nowIso(),
  };
}

export function resolveHostRegistryFile(options: HostRegistryOptions = {}): string {
  if (options.clawHome?.trim()) {
    return path.join(options.clawHome, "hosts", "registry.json");
  }
  return resolveClawHostRegistryPath({
    homeDir: options.homeDir ?? os.homedir(),
    platform: (options.platform ?? process.platform) as "darwin" | "linux" | "win32",
    xdgDataHome: process.env.XDG_DATA_HOME,
    appDataDir: process.env.APPDATA,
  });
}

export function readHostRegistry(options: HostRegistryOptions = {}): ClawHostRegistry {
  const file = resolveHostRegistryFile(options);
  if (!fs.existsSync(file)) return emptyRegistry();
  const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  return clawHostRegistrySchema.parse(parsed);
}

function writeHostRegistry(registry: ClawHostRegistry, options: HostRegistryOptions = {}): ClawHostRegistry {
  const normalized = clawHostRegistrySchema.parse({
    ...registry,
    updatedAt: nowIso(),
  });
  const file = resolveHostRegistryFile(options);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(normalized, null, 2)}\n`);
  return normalized;
}

export function registerHost(input: Omit<ClawHostDescriptor, "schemaVersion" | "registeredAt" | "updatedAt" | "capabilities"> & {
  capabilities?: ClawHostDescriptor["capabilities"];
}, options: HostRegistryOptions = {}, setActive = false): ClawHostRegistry {
  const registry = readHostRegistry(options);
  const existing = registry.hosts.find((host) => host.id === input.id);
  const registeredAt = existing?.registeredAt ?? nowIso();
  const host = clawHostDescriptorSchema.parse({
    ...input,
    schemaVersion: clawContractVersionV1,
    capabilities: input.capabilities ?? existing?.capabilities ?? [],
    registeredAt,
    updatedAt: nowIso(),
  });
  const hosts = [
    ...registry.hosts.filter((entry) => entry.id !== host.id),
    host,
  ].sort((left, right) => left.id.localeCompare(right.id));
  return writeHostRegistry({
    ...registry,
    hosts,
    activeHostId: setActive || registry.activeHostId === null ? host.id : registry.activeHostId,
  }, options);
}

export function useHost(hostId: string, options: HostRegistryOptions = {}): ClawHostRegistry {
  const registry = readHostRegistry(options);
  if (!registry.hosts.some((host) => host.id === hostId)) {
    throw new Error(`Host not registered: ${hostId}`);
  }
  return writeHostRegistry({ ...registry, activeHostId: hostId }, options);
}

export function activeHost(registry: ClawHostRegistry): ClawHostDescriptor | null {
  if (!registry.activeHostId) return null;
  return registry.hosts.find((host) => host.id === registry.activeHostId) ?? null;
}
