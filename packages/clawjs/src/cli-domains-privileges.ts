import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";

import { CliHandledError } from "./cli-errors.ts";

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}
function sudoScript(script: string): void {
  const result = spawnSync("sudo", [
    ...(process.stdin.isTTY ? [] : ["-n"]),
    "sh",
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
  const helperPath = path.join(os.tmpdir(), `claw-domains-privileged-${process.pid}.sh`);
  fs.writeFileSync(helperPath, `#!/bin/sh\nset -eu\n${script}\n`, { mode: 0o700 });
  const result = spawnSync("osascript", [
    "-e",
    `do shell script ${appleScriptQuote(`/bin/sh ${shellQuote(helperPath)}`)} with administrator privileges`,
  ], {
    encoding: "utf8",
  });
  fs.rmSync(helperPath, { force: true });
  if (result.status !== 0) {
    const message = (result.stderr || result.stdout || "").trim();
    throw new CliHandledError("domains_install_failed", message || "Failed to update local .claw domain configuration.");
  }
}
