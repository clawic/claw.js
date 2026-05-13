import os from "node:os";
import path from "node:path";

export interface TelegramSurfaceConfig {
  host: string;
  port: number;
  workspace: string;
}

function defaultWorkspace(): string {
  const fromEnv = process.env.CLAW_TELEGRAM_WORKSPACE?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  const fromOpen = process.env.CLAW_OPEN_WORKSPACE?.trim();
  if (fromOpen) return path.resolve(fromOpen);
  return path.resolve(process.cwd());
}

export function loadTelegramConfig(): TelegramSurfaceConfig {
  const host = process.env.CLAW_TELEGRAM_HOST?.trim() || "127.0.0.1";
  const portRaw = process.env.CLAW_TELEGRAM_PORT?.trim() || "24150";
  const port = Number.parseInt(portRaw, 10);
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error(`invalid CLAW_TELEGRAM_PORT: ${portRaw}`);
  }
  return {
    host,
    port,
    workspace: defaultWorkspace() || os.homedir(),
  };
}
