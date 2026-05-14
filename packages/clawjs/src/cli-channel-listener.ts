import fs from "fs";
import path from "path";
import { resolveClawPersistentSurfacePath } from "@clawjs/core";

export function channelListenerId(provider: string, accountId?: string): string {
  return `${provider}:${accountId?.trim() || "default"}`;
}

export function channelListenerPaths(workspaceRoot: string, provider: string, accountId?: string): { runDir: string; pidPath: string; stopPath: string; logPath: string } {
  const safeId = channelListenerId(provider, accountId).replace(/[^A-Za-z0-9._-]+/g, "_");
  const runDir = resolveClawPersistentSurfacePath("claw.workspace.channel_run", workspaceRoot);
  return {
    runDir,
    pidPath: path.join(runDir, `${safeId}.pid`),
    stopPath: path.join(runDir, `${safeId}.stop`),
    logPath: path.join(runDir, `${safeId}.log`),
  };
}

export function isProcessRunning(pid: number | undefined): boolean {
  if (!pid || !Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function readListenerPid(pidPath: string): number | undefined {
  try {
    const value = Number(fs.readFileSync(pidPath, "utf8").trim());
    return Number.isSafeInteger(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

export async function waitForListenerPid(pidPath: string, timeoutMs = 5_000): Promise<number | undefined> {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    const pid = readListenerPid(pidPath);
    if (pid && isProcessRunning(pid)) return pid;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return undefined;
}

export function readTail(filePath: string, lines: number): string {
  try {
    return fs.readFileSync(filePath, "utf8").split(/\r?\n/).slice(-Math.max(1, lines)).join("\n");
  } catch {
    return "";
  }
}
