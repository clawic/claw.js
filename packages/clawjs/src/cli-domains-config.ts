import path from "path";

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
