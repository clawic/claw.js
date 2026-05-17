import type { MacActionRequest } from "@clawjs/core";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface MacSignedHostBridge {
  execute(request: MacActionRequest): Promise<unknown>;
  revert(receiptId: string): Promise<unknown>;
  audit(): Promise<unknown>;
  permissions(): Promise<unknown>;
}

export function createMacSignedHostBridge(command: string | null | undefined, env: NodeJS.ProcessEnv = process.env): MacSignedHostBridge | null {
  const parts = splitCommand(command);
  if (!parts) return null;
  const [executable, ...prefixArgs] = parts;
  return {
    execute: async (request) => runHostCommand(executable, [...prefixArgs, "system", "mac", "execute", "--request-json", JSON.stringify(request), "--json"], env),
    revert: async (receiptId) => runHostCommand(executable, [...prefixArgs, "system", "mac", "revert", "--receipt-id", receiptId, "--json"], env),
    audit: async () => runHostCommand(executable, [...prefixArgs, "system", "mac", "audit", "--json"], env),
    permissions: async () => runHostCommand(executable, [...prefixArgs, "system", "mac", "permissions", "--json"], env),
  };
}

function splitCommand(command: string | null | undefined): string[] | null {
  const trimmed = command?.trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/);
}

async function runHostCommand(executable: string, args: string[], env: NodeJS.ProcessEnv): Promise<unknown> {
  try {
    const { stdout } = await execFileAsync(executable, args, { env, maxBuffer: 4 * 1024 * 1024 });
    return parseHostJSON(stdout);
  } catch (error) {
    const stdout = typeof (error as { stdout?: unknown }).stdout === "string" ? (error as { stdout: string }).stdout : "";
    if (stdout.trim()) return parseHostJSON(stdout);
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`signed_host_bridge_failed:${message}`);
  }
}

function parseHostJSON(stdout: string): unknown {
  try {
    return JSON.parse(stdout);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`signed_host_bridge_invalid_json:${message}`);
  }
}
