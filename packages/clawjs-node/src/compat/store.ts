import fs from "fs";
import path from "path";
import { compatSnapshotSchema, type CompatSnapshot } from "@clawjs/core";

import type { RuntimeCompatReport, RuntimeProbeStatus } from "../runtime/contracts.ts";
import { NodeFileSystemHost, resolveFileLockPath } from "../host/filesystem.ts";
import { resolveClawWorkspaceSurfacePath } from "../surface-paths.ts";

export const COMPAT_SNAPSHOT_FILE = "runtime-snapshot.json";

export function resolveCompatSnapshotPath(workspaceDir: string): string {
  return resolveClawWorkspaceSurfacePath("claw.workspace.compat", workspaceDir, COMPAT_SNAPSHOT_FILE);
}

function serializeCompatSnapshot(snapshot: CompatSnapshot): string {
  return `${JSON.stringify(snapshot, null, 2)}\n`;
}

export function normalizeCompatSnapshot(value: unknown): CompatSnapshot | null {
  const parsed = compatSnapshotSchema.safeParse(value);
  return parsed.success ? parsed.data as CompatSnapshot : null;
}

export function readCompatSnapshot(workspaceDir: string, filesystem = new NodeFileSystemHost()): CompatSnapshot | null {
  try {
    return normalizeCompatSnapshot(JSON.parse(filesystem.readText(resolveCompatSnapshotPath(workspaceDir))));
  } catch {
    return null;
  }
}

export interface CompatSnapshotCanonicalizationResult {
  snapshot: CompatSnapshot | null;
  targetPath: string;
  canonicalized: boolean;
}

export function canonicalizeCompatSnapshotFile(workspaceDir: string, filesystem = new NodeFileSystemHost()): CompatSnapshotCanonicalizationResult {
  const targetPath = resolveCompatSnapshotPath(workspaceDir);
  const currentSnapshot = readCompatSnapshot(workspaceDir, filesystem);
  if (currentSnapshot) {
    const serialized = serializeCompatSnapshot(currentSnapshot);
    const existing = filesystem.tryReadText(targetPath).replace(/\r\n/g, "\n");
    if (existing !== serialized) {
      filesystem.withLockRetry(resolveFileLockPath(targetPath), () => filesystem.writeTextAtomic(targetPath, serialized));
      return {
        snapshot: currentSnapshot,
        targetPath,
        canonicalized: true,
      };
    }

    return {
      snapshot: currentSnapshot,
      targetPath,
      canonicalized: false,
    };
  }

  return {
    snapshot: null,
    targetPath,
    canonicalized: false,
  };
}

export function writeCompatSnapshot(workspaceDir: string, status: RuntimeProbeStatus, compat: RuntimeCompatReport, filesystem = new NodeFileSystemHost()): CompatSnapshot {
  const snapshot: CompatSnapshot = {
    schemaVersion: 1,
    runtimeAdapter: compat.runtimeAdapter || status.adapter || "unknown",
    runtimeVersion: status.version,
    probedAt: new Date().toISOString(),
    capabilities: compat.capabilities,
    diagnostics: {
      degraded: compat.degraded,
      issues: compat.issues,
      ...status.diagnostics,
      ...(compat.diagnostics ?? {}),
    },
  };

  const filePath = resolveCompatSnapshotPath(workspaceDir);
  filesystem.withLockRetry(resolveFileLockPath(filePath), () => {
    filesystem.writeTextAtomic(filePath, serializeCompatSnapshot(snapshot));
  });

  return snapshot;
}

export function compatSnapshotExists(workspaceDir: string): boolean {
  return fs.existsSync(resolveCompatSnapshotPath(workspaceDir));
}
