import path from "path";

import { allOpenSurfaceHostnames } from "./cli-open-surfaces.ts";

export const CLAW_DOMAINS_BEGIN = "# BEGIN CLAWJS DOMAINS";
export const CLAW_DOMAINS_END = "# END CLAWJS DOMAINS";
export const CLAW_DOMAINS_LABEL = "com.claw.domains";
const CLAW_DOMAINS_SERVICE_DIR = "/Library/Application Support/ClawJS/domains";

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function domainsPlistPath(flags: Record<string, string>): string {
  return flags["plist-file"] || `/Library/LaunchDaemons/${CLAW_DOMAINS_LABEL}.plist`;
}

export function domainsHostsFile(flags: Record<string, string>): string {
  return flags["hosts-file"] || "/etc/hosts";
}

export function domainsServiceDir(flags: Record<string, string>): string {
  return flags["service-dir"] || CLAW_DOMAINS_SERVICE_DIR;
}

export function domainsProxyScriptPath(flags: Record<string, string>): string {
  return path.join(domainsServiceDir(flags), "proxy.mjs");
}

export function domainsProxyConfigPath(flags: Record<string, string>): string {
  return path.join(domainsServiceDir(flags), "config.json");
}

export function buildDomainsPlist(flags: Record<string, string>): string {
  const args = [
    process.execPath,
    domainsProxyScriptPath(flags),
    "--config",
    domainsProxyConfigPath(flags),
  ];
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">`,
    `<plist version="1.0">`,
    `<dict>`,
    `  <key>Label</key>`,
    `  <string>${CLAW_DOMAINS_LABEL}</string>`,
    `  <key>ProgramArguments</key>`,
    `  <array>`,
    ...args.map((arg) => `    <string>${xmlEscape(arg)}</string>`),
    `  </array>`,
    `  <key>WorkingDirectory</key>`,
    `  <string>${xmlEscape(domainsServiceDir(flags))}</string>`,
    `  <key>RunAtLoad</key>`,
    `  <true/>`,
    `  <key>KeepAlive</key>`,
    `  <true/>`,
    `  <key>StandardOutPath</key>`,
    `  <string>/tmp/clawjs-domains.out.log</string>`,
    `  <key>StandardErrorPath</key>`,
    `  <string>/tmp/clawjs-domains.err.log</string>`,
    `</dict>`,
    `</plist>`,
    "",
  ].join("\n");
}

export function domainHostsBlock(): string {
  return [
    CLAW_DOMAINS_BEGIN,
    `127.0.0.1 ${allOpenSurfaceHostnames().join(" ")}`,
    CLAW_DOMAINS_END,
  ].join("\n");
}

export function replaceDomainHostsBlock(current: string, nextBlock: string | null): string {
  const pattern = new RegExp(`${CLAW_DOMAINS_BEGIN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${CLAW_DOMAINS_END.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\n?`, "m");
  const without = current.replace(pattern, "").replace(/\n{3,}/g, "\n\n").trimEnd();
  if (!nextBlock) return without ? `${without}\n` : "";
  return `${without ? `${without}\n\n` : ""}${nextBlock}\n`;
}
