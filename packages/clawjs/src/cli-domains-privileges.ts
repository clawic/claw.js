import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

import { requireMacCareRoutePathPattern } from "@clawjs/core";

import { CliHandledError } from "./cli-errors.ts";

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function domainsPrivilegeSystemToolPath(routeId: string): string {
  return requireMacCareRoutePathPattern(routeId);
}

export function domainsPrivilegeShellPath(): string {
  return domainsPrivilegeSystemToolPath("mac_care.route.system_sh_cli");
}

function domainsPrivilegeSudoPath(): string {
  return domainsPrivilegeSystemToolPath("mac_care.route.system_sudo_cli");
}

export function domainsPrivilegeOsascriptPath(): string {
  return domainsPrivilegeSystemToolPath("mac_care.route.system_osascript_cli");
}

export function domainsPrivilegeHelperPath(pid: number = process.pid): string {
  return path.join(domainsPrivilegeSystemToolPath("mac_care.route.system_temp"), `claw-domains-privileged-${pid}.sh`);
}

export function buildPrivilegedHelperScript(script: string): string {
  return `#!${domainsPrivilegeShellPath()}\nset -eu\n${script}\n`;
}

export function buildPrivilegedAppleScriptCommand(helperPath: string): string {
  return `do shell script ${appleScriptQuote(`${domainsPrivilegeShellPath()} ${shellQuote(helperPath)}`)} with administrator privileges`;
}

function sudoScript(script: string): void {
  const result = spawnSync(domainsPrivilegeSudoPath(), [
    ...(process.stdin.isTTY ? [] : ["-n"]),
    domainsPrivilegeShellPath(),
    "-c",
    script,
  ], { stdio: "inherit" });
  if (result.status !== 0) {
    throw new CliHandledError("domains_install_failed", "Failed to update local .claw domain configuration.");
  }
}
function appleScriptQuote(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`;
}

export function runPrivilegedScript(script: string, flags: Record<string, string>): void {
  if (process.platform !== "darwin" || flags.auth === "sudo" || flags["no-gui"]) {
    sudoScript(script);
    return;
  }
  const helperPath = domainsPrivilegeHelperPath();
  fs.writeFileSync(helperPath, buildPrivilegedHelperScript(script), { mode: 0o700 });
  const result = spawnSync(domainsPrivilegeOsascriptPath(), [
    "-e",
    buildPrivilegedAppleScriptCommand(helperPath),
  ], {
    encoding: "utf8",
  });
  fs.rmSync(helperPath, { force: true });
  if (result.status !== 0) {
    const message = (result.stderr || result.stdout || "").trim();
    throw new CliHandledError("domains_install_failed", message || "Failed to update local .claw domain configuration.");
  }
}
