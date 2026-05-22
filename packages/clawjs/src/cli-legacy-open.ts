import fs from "fs";
import os from "os";
import path from "path";
import { spawn, spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { requireMacCareRoutePathPattern, type ClawDomain } from "@clawjs/core";
import { buildOpenUsage, openSurfaceRows, resolveOpenSurface, surfacePrimaryClawUrl, type OpenSurface, type OpenSurfaceState } from "./cli-open-surfaces.ts";
import { currentCliEntryPath, openBrowser, openStateDir, openStatePath, readOpenState, repoRootFromCliPackage, writeOpenState } from "./cli-open-state.ts";
import { buildSurfaceCommand, ensureSurfaceBuild, prepareOpenSurface } from "./cli-open-runtime.ts";
import { portIsOpen, probeHttpServer, processIsAlive, waitForUrl } from "./cli-process-utils.ts";
import { CLAW_DOMAINS_BEGIN, CLAW_DOMAINS_END, surfaceTargetPort } from "./cli-domains-config.ts";
import { formatCliTable, readBooleanFlag } from "./cli-flag-parsers.ts";
import { CLI_EXIT_FAILURE, CLI_EXIT_OK, CLI_EXIT_USAGE, CliHandledError } from "./cli-errors.ts";
import { writeCommandJsonOk } from "./cli-json.ts";
import type { CliContext } from "./cli-legacy.ts";

function macCareSystemRoutePath(routeId: string): string {
  return requireMacCareRoutePathPattern(routeId);
}

export function openDomainsHostsFile(flags: Record<string, string>): string {
  return flags["domains-hosts-file"] || flags["hosts-file"] || macCareSystemRoutePath("mac_care.route.system_hosts_file");
}

export function openDomainsDisabledHostsFile(): string {
  return path.join(macCareSystemRoutePath("mac_care.route.system_temp"), "claw-domains-disabled-hosts");
}

export function isClawDomainConfigured(flags: Record<string, string>): boolean {
  if (process.env.CLAW_DOMAINS_ACTIVE === "1") return true;
  if (process.env.CLAW_DOMAINS_ACTIVE === "0") return false;
  const hostsFile = openDomainsHostsFile(flags);
  try {
    const content = fs.readFileSync(hostsFile, "utf8");
    return content.includes(CLAW_DOMAINS_BEGIN) && content.includes(CLAW_DOMAINS_END);
  } catch {
    return false;
  }
}
export async function ensureDomainSurfaceRunning(surface: OpenSurface, flags: Record<string, string>, workspace: string): Promise<URL> {
  const port = surfaceTargetPort(surface, flags);
  const targetUrl = new URL(`http://127.0.0.1:${port}`);
  if (await probeHttpServer(targetUrl)) return targetUrl;
  if (flags["no-auto-start"] !== undefined || flags["auto-start"] === "false") return targetUrl;
  const result = spawnSync(process.execPath, [
    currentCliEntryPath(),
    "open",
    surface.id,
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--workspace",
    workspace,
    "--domains-hosts-file",
    openDomainsDisabledHostsFile(),
    "--no-browser",
    "--json",
  ], {
    cwd: repoRootFromCliPackage(),
    encoding: "utf8",
    env: {
      ...process.env,
      CLAW_DOMAINS_ACTIVE: "0",
    },
  });
  if (result.status !== 0) {
    throw new CliHandledError("domain_surface_start_failed", result.stdout || result.stderr || `Failed to start ${surface.id}.`);
  }
  return targetUrl;
}

export async function runOpenCli(input: {
  argv: string[];
  positionals: string[];
  flags: Record<string, string>;
  context: CliContext;
  wantsJson: boolean;
  binName: string;
}): Promise<number> {
  const surfaceName = input.positionals[1];
  if (!surfaceName || surfaceName === "list") {
    if (input.wantsJson) {
      writeCommandJsonOk(input.context.stdout, "open", { dashboards: openSurfaceRows(isClawDomainConfigured(input.flags)) }, { subcommand: "list" });
    } else {
      input.context.stdout.write(`${formatCliTable(openSurfaceRows(isClawDomainConfigured(input.flags)))}\n`);
    }
    return CLI_EXIT_OK;
  }
  if (surfaceName === "help" || input.argv.includes("--help") || input.argv.includes("-h")) {
    input.context.stdout.write(`${buildOpenUsage(input.binName)}\n`);
    return CLI_EXIT_OK;
  }

  const surface = resolveOpenSurface(surfaceName);
  if (!surface) {
    throw new CliHandledError("unknown_dashboard", `Unknown dashboard: ${surfaceName}`, CLI_EXIT_USAGE);
  }

  const host = input.flags.host ?? "127.0.0.1";
  const port = input.flags.port ? Number(input.flags.port) : surface.port;
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new CliHandledError("invalid_port", `Invalid port: ${input.flags.port}`, CLI_EXIT_USAGE);
  }

  const workspace = path.resolve(input.context.cwd, input.flags.workspace ?? ".");
  const directUrl = `http://${host}:${port}`;
  const useClawDomain = isClawDomainConfigured(input.flags) && host === "127.0.0.1" && port === surface.port;
  const url = useClawDomain ? surfacePrimaryClawUrl(surface) : directUrl;
  const statePath = openStatePath(surface.id, host, port);
  const state = readOpenState(statePath);
  if (state && state.surface === surface.id && state.host === host && state.port === port && processIsAlive(state.pid)) {
    if (await waitForUrl(state.targetUrl || state.url, 1_000)) {
      const outputUrl = useClawDomain ? surfacePrimaryClawUrl(surface) : state.url;
      if (!input.argv.includes("--no-browser") && !readBooleanFlag(input.argv, input.flags, "no-browser", false)) openBrowser(outputUrl);
      if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "open", { reused: true, surface: surface.id, url: outputUrl, pid: state.pid }, { subcommand: surface.id });
      else input.context.stdout.write(`${outputUrl}\n`);
      return CLI_EXIT_OK;
    }
  }
  if (state) {
    fs.rmSync(statePath, { force: true });
  }

  if (await portIsOpen(host, port)) {
    throw new CliHandledError("port_in_use", `${directUrl} is already in use. Use --port to choose another port.`);
  }

  ensureSurfaceBuild(surface);
  prepareOpenSurface(surface, workspace);
  const command = buildSurfaceCommand(surface, { host, port, workspace });
  const child = spawn(command.command, command.args, {
    cwd: command.cwd,
    env: command.env,
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  if (!child.pid) {
    throw new CliHandledError("dashboard_start_failed", `Failed to start ${surface.id} dashboard.`);
  }

  const nextState: OpenSurfaceState = {
    surface: surface.id,
    pid: child.pid,
    host,
    port,
    url,
    targetUrl: directUrl,
    workspace,
    startedAt: new Date().toISOString(),
  };
  writeOpenState(statePath, nextState);

  const ready = await waitForUrl(directUrl);
  if (!ready) {
    throw new CliHandledError("dashboard_start_timeout", `${surface.id} dashboard did not become ready at ${directUrl}.`);
  }

  const browserUrl = surface.id === "storage" && fs.existsSync(path.join(openStateDir(), `storage-token-${host}-${port}.txt`))
    ? `${url}?token=${encodeURIComponent(fs.readFileSync(path.join(openStateDir(), `storage-token-${host}-${port}.txt`), "utf8").trim())}&bucket=workspace`
    : url;
  if (!input.argv.includes("--no-browser") && !readBooleanFlag(input.argv, input.flags, "no-browser", false)) openBrowser(browserUrl);
  if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "open", { reused: false, surface: surface.id, url, pid: child.pid }, { subcommand: surface.id });
  else input.context.stdout.write(`${url}\n`);
  return CLI_EXIT_OK;
}

export const HOST_FORWARD_DOMAINS = new Set<ClawDomain>([
  "agents",
  "skills",
  "design",
  "sessions",
  "projects",
  "memory",
  "files",
  "productivity",
  "calendar",
  "contacts",
  "reminders",
  "mail",
  "notes",
  "messages",
  "browser",
  "terminal",
  "voice",
  "models",
  "services",
  "database",
  "connections",
  "integrations",
  "system",
  "secrets",
  "mini_apps",
]);

export function runForegroundProcess(
  command: string,
  args: string[],
  options: {
    cwd: string;
    env?: NodeJS.ProcessEnv;
    stdout: NodeJS.WritableStream;
    stderr: NodeJS.WritableStream;
  },
): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout?.on("data", (chunk) => options.stdout.write(chunk));
    child.stderr?.on("data", (chunk) => options.stderr.write(chunk));
    child.on("error", (error) => {
      options.stderr.write(`${error.message}\n`);
      resolve(CLI_EXIT_FAILURE);
    });
    child.on("close", (exitCode) => resolve(exitCode ?? CLI_EXIT_FAILURE));
  });
}
export function resolveCliPackageVersion(): string | null {
  try {
    const packageJsonPath = fileURLToPath(new URL("../package.json", import.meta.url));
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as { version?: string };
    return packageJson.version ?? null;
  } catch {
    return null;
  }
}

export function resolveRelayBaseUrl(flags: Record<string, string>): string {
  const raw = flags["relay-url"] ?? process.env.CLAW_RELAY_URL ?? process.env.RELAY_URL ?? "";
  if (!raw.trim()) {
    throw new Error("--relay-url is required");
  }
  const trimmed = raw.trim().replace(/\/$/, "");
  return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
}

export function requireRelayBrowserConfig(flags: Record<string, string>): {
  baseUrl: string;
  accessToken: string;
  tenantId: string;
  agentId: string;
  workspaceId: string;
} {
  const accessToken = (flags["access-token"] ?? process.env.CLAW_RELAY_ACCESS_TOKEN ?? "").trim();
  const tenantId = (flags["tenant-id"] ?? process.env.CLAW_RELAY_TENANT_ID ?? "").trim();
  const agentId = (flags["agent-id"] ?? process.env.CLAW_RELAY_AGENT_ID ?? "").trim();
  const workspaceId = (flags["workspace-id"] ?? process.env.CLAW_RELAY_WORKSPACE_ID ?? "").trim();
  if (!accessToken) throw new Error("--access-token is required");
  if (!tenantId) throw new Error("--tenant-id is required");
  if (!agentId) throw new Error("--agent-id is required");
  if (!workspaceId) throw new Error("--workspace-id is required");
  return {
    baseUrl: resolveRelayBaseUrl(flags),
    accessToken,
    tenantId,
    agentId,
    workspaceId,
  };
}

export async function relayBrowserRequest<T>(
  flags: Record<string, string>,
  input: {
    method: "GET" | "POST";
    path: string;
    body?: unknown;
  },
): Promise<T> {
  const { baseUrl, accessToken } = requireRelayBrowserConfig(flags);
  const response = await fetch(`${baseUrl}${input.path}`, {
    method: input.method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    ...(input.body !== undefined ? { body: JSON.stringify(input.body) } : {}),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `Relay browser request failed: ${response.status}`);
  }
  const text = await response.text();
  return (text ? JSON.parse(text) : null) as T;
}
