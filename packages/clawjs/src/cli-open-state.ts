import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

import { requireMacCareRoutePathPattern } from "@clawjs/core";

import type { OpenSurfaceState } from "./cli-open-surfaces.ts";

export function openStateDir(): string {
  return path.join(requireMacCareRoutePathPattern("mac_care.route.system_temp"), "clawjs-open");
}

export function openStatePath(surface: string, host: string, port: number): string {
  return path.join(openStateDir(), `${surface}-${host.replace(/[^a-z0-9.-]/gi, "_")}-${port}.json`);
}

export function repoRootFromCliPackage(): string {
  return path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));
}

export function currentCliEntryPath(): string {
  const entry = fileURLToPath(import.meta.url);
  const packagedBin = path.resolve(path.dirname(entry), "..", "bin", "claw.mjs");
  return fs.existsSync(packagedBin) ? packagedBin : entry;
}

export function readOpenState(filePath: string): OpenSurfaceState | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as OpenSurfaceState;
  } catch {
    return null;
  }
}

export function writeOpenState(filePath: string, state: OpenSurfaceState): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`);
}

export function openBrowserMacPath(): string {
  return requireMacCareRoutePathPattern("mac_care.route.system_open_cli");
}

export function openBrowser(url: string): void {
  if (process.env.CI || !url.trim()) return;
  if (process.platform === "darwin") {
    spawn(openBrowserMacPath(), [url], { stdio: "ignore", detached: true }).unref();
    return;
  }
  if (process.platform === "win32") {
    spawn("cmd", ["/c", "start", "", url], { stdio: "ignore", detached: true }).unref();
    return;
  }
  spawn("xdg-open", [url], { stdio: "ignore", detached: true }).unref();
}
