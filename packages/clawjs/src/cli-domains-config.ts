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

export function buildDomainsProxyScript(): string {
  return `import http from "node:http";
import net from "node:net";
import fs from "node:fs";
import { spawnSync } from "node:child_process";

const configPath = process.argv[process.argv.indexOf("--config") + 1];
if (!configPath) throw new Error("Missing --config");
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const surfaces = config.surfaces;
const byName = new Map();
for (const surface of surfaces) {
  byName.set(surface.id, surface);
  for (const alias of surface.aliases || []) byName.set(alias, surface);
}

function surfacePort(surface) {
  return config.surfacePorts?.[surface.id] || surface.port;
}

function parseSurface(hostHeader) {
  const host = String(hostHeader || "").split(":")[0].trim().toLowerCase();
  if (!host.endsWith(".claw")) return null;
  return byName.get(host.slice(0, -".claw".length)) || null;
}

function indexHtml() {
  const links = surfaces.map((surface) => '<a class="surface" href="http://' + surface.id + '.claw"><span>' + surface.label + '</span><code>' + surface.id + '.claw</code></a>').join("");
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Claw domains</title><style>:root{color-scheme:light dark;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}body{margin:0;min-height:100vh;background:#f7f8fb;color:#16181d}main{max-width:960px;margin:0 auto;padding:48px 24px}h1{margin:0 0 8px;font-size:32px;letter-spacing:0}p{margin:0 0 28px;color:#5f6573}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}.surface{display:flex;flex-direction:column;gap:6px;padding:14px 16px;border:1px solid #dde1e8;border-radius:8px;background:#fff;color:inherit;text-decoration:none}.surface:hover{border-color:#9aa4b5}.surface span{font-weight:650}code{color:#315b9f;font-size:13px;overflow-wrap:anywhere}@media (prefers-color-scheme:dark){body{background:#111318;color:#f2f4f8}p{color:#a6adbb}.surface{background:#191c23;border-color:#303642}.surface:hover{border-color:#687386}code{color:#8bb6ff}}</style></head><body><main><h1>Claw domains</h1><p>Local dashboards available on this machine.</p><section class="grid">' + links + '</section></main></body></html>';
}

async function probe(url) {
  try {
    const response = await fetch(url, { method: "GET" });
    return response.status < 500;
  } catch {
    return false;
  }
}

async function ensureSurface(surface) {
  const target = "http://127.0.0.1:" + surfacePort(surface);
  if (await probe(target)) return target;
  const openArgs = [
    config.cliEntryPath,
    "open",
    surface.id,
    "--host",
    "127.0.0.1",
    "--port",
    String(surfacePort(surface)),
    "--workspace",
    config.workspace,
    "--domains-hosts-file",
    "/tmp/clawjs-domains-disabled-hosts",
    "--no-browser",
    "--json",
  ];
  const envArgs = [
    "HOME=" + config.homeDir,
    "USER=" + config.username,
    "LOGNAME=" + config.username,
    "PATH=/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin",
    "CLAW_DOMAINS_ACTIVE=0",
  ];
  const command = process.platform === "darwin"
    ? ["/bin/launchctl", ["asuser", String(config.uid), "/usr/bin/sudo", "-u", config.username, "/usr/bin/env", ...envArgs, config.nodePath, ...openArgs]]
    : [config.nodePath, openArgs];
  const result = spawnSync(command[0], command[1], { cwd: "/", encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stdout || result.stderr || "Failed to start " + surface.id);
  return target;
}

async function proxy(request, response, targetBase) {
  const incoming = new URL(request.url || "/", "http://127.0.0.1");
  const target = new URL(targetBase);
  target.pathname = incoming.pathname;
  target.search = incoming.search;
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (key.toLowerCase() === "host" || value === undefined) continue;
    if (Array.isArray(value)) for (const item of value) headers.append(key, item);
    else headers.set(key, value);
  }
  const body = request.method === "GET" || request.method === "HEAD" ? undefined : request;
  const upstream = await fetch(target, {
    method: request.method,
    headers,
    body,
    redirect: "manual",
    duplex: body ? "half" : undefined,
  });
  response.statusCode = upstream.status;
  upstream.headers.forEach((value, key) => {
    if (key.toLowerCase() !== "content-encoding") response.setHeader(key, value);
  });
  if (!upstream.body) {
    response.end();
    return;
  }
  const reader = upstream.body.getReader();
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    response.write(Buffer.from(chunk.value));
  }
  response.end();
}

const server = http.createServer((request, response) => {
  void (async () => {
    const surface = parseSurface(request.headers.host);
    if (!surface) {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(indexHtml());
      return;
    }
    await proxy(request, response, await ensureSurface(surface));
  })().catch((error) => {
    response.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
    response.end(error instanceof Error ? error.message : "Domain proxy failed.");
  });
});

server.listen(config.port, config.host);
`;
}
