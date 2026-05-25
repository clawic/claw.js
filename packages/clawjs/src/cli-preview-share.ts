import fs from "fs";
import http from "http";
import os from "os";
import path from "path";
import { spawn, spawnSync } from "child_process";
import { randomBytes } from "crypto";

import { CLI_EXIT_FAILURE, CLI_EXIT_OK, CLI_EXIT_USAGE, CliHandledError } from "./cli-errors.ts";
import { writeCommandJsonOk, writeCommandJsonOkLine } from "./cli-json.ts";
import { probeHttpServer } from "./cli-process-utils.ts";
import { parseSimpleDurationMs } from "./cli-temporal-utils.ts";

type PreviewShareMode = "lan" | "tailscale" | "cloudflare" | "relay";

interface PreviewSharePayload {
  ok: true;
  mode: PreviewShareMode;
  targetUrl: string;
  shareUrl: string;
  token: string;
  tokenParam: string;
  expiresAt: string;
  qrPayload: string;
  provider?: {
    available: boolean;
    command?: string[];
    message?: string;
  };
}

export function parsePreviewShareMode(value: string | undefined): PreviewShareMode {
  if (!value || value === "lan") return "lan";
  if (value === "tailscale" || value === "cloudflare" || value === "relay") return value;
  throw new CliHandledError("invalid_enum", `Invalid preview share mode "${value}". Allowed values: lan, tailscale, cloudflare, relay.`, CLI_EXIT_USAGE);
}

export function resolvePreviewTargetUrl(flags: Record<string, string>): URL {
  const raw = flags.url?.trim() || (flags.port?.trim() ? `http://127.0.0.1:${flags.port.trim()}` : "");
  if (!raw) {
    throw new CliHandledError("usage_error", "--url or --port is required", CLI_EXIT_USAGE);
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new CliHandledError("usage_error", `Invalid preview URL: ${raw}`, CLI_EXIT_USAGE);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new CliHandledError("usage_error", "Preview URL must use http or https.", CLI_EXIT_USAGE);
  }
  return url;
}

function resolvePreviewShareTtlMs(flags: Record<string, string>): number {
  const parsed = parseSimpleDurationMs(flags.ttl || flags["expires-in"] || "30m");
  if (!parsed) {
    throw new CliHandledError("usage_error", "--ttl must use a duration like 15m, 1h, or 1d", CLI_EXIT_USAGE);
  }
  return parsed;
}

function parseCanonicalDecimalPort(value: string): number | null {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) return null;
  const port = Number(value);
  if (port < 0 || port > 65535) return null;
  return port;
}

function resolveLanAdvertiseHost(flags: Record<string, string>): string {
  if (flags["advertise-host"]?.trim()) return flags["advertise-host"].trim();
  if (flags.host?.trim() && flags.host.trim() !== "0.0.0.0") return flags.host.trim();
  const interfaces = os.networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) return entry.address;
    }
  }
  return "127.0.0.1";
}

function appendQueryParam(url: string, key: string, value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new CliHandledError("invalid_preview_share_url", "--share-url must be a valid http or https URL.", CLI_EXIT_USAGE);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new CliHandledError("invalid_preview_share_url", "--share-url must use http or https.", CLI_EXIT_USAGE);
  }
  parsed.searchParams.set(key, value);
  return parsed.toString();
}

function findExecutable(name: string, env = process.env): string | null {
  const pathValue = env.PATH ?? "";
  const extensions = process.platform === "win32" ? ["", ".exe", ".cmd", ".bat"] : [""];
  for (const dir of pathValue.split(path.delimiter).filter(Boolean)) {
    for (const extension of extensions) {
      const candidate = path.join(dir, `${name}${extension}`);
      try {
        fs.accessSync(candidate, fs.constants.X_OK);
        return candidate;
      } catch {
        // Try the next PATH entry.
      }
    }
  }
  return null;
}

function buildLanPreviewSharePayload(input: {
  targetUrl: URL;
  flags: Record<string, string>;
  token: string;
  expiresAt: Date;
  actualPort: number;
}): PreviewSharePayload {
  const tokenParam = input.flags["token-param"] || "claw_share_token";
  const host = resolveLanAdvertiseHost(input.flags);
  const shareUrl = appendQueryParam(`http://${host}:${input.actualPort}/`, tokenParam, input.token);
  return {
    ok: true,
    mode: "lan",
    targetUrl: input.targetUrl.toString(),
    shareUrl,
    token: input.token,
    tokenParam,
    expiresAt: input.expiresAt.toISOString(),
    qrPayload: shareUrl,
  };
}

function previewSharePayloadBody(payload: PreviewSharePayload): Omit<PreviewSharePayload, "ok"> {
  const { ok: _ok, ...data } = payload;
  return data;
}

function writePreviewShareJson(stdout: NodeJS.WritableStream, payload: PreviewSharePayload): void {
  writeCommandJsonOk(stdout, "preview", previewSharePayloadBody(payload), {
    subcommand: "share",
    mode: payload.mode,
  });
}

function writePreviewShareJsonLine(stdout: NodeJS.WritableStream, payload: PreviewSharePayload): void {
  writeCommandJsonOkLine(stdout, "preview", previewSharePayloadBody(payload), {
    subcommand: "share",
    mode: payload.mode,
  });
}

async function pipePreviewProxyResponse(input: {
  targetUrl: URL;
  request: http.IncomingMessage;
  response: http.ServerResponse;
  token: string;
  tokenParam: string;
  expiresAtMs: number;
}): Promise<void> {
  const incomingUrl = new URL(input.request.url || "/", "http://127.0.0.1");
  if (incomingUrl.searchParams.get(input.tokenParam) !== input.token) {
    input.response.writeHead(401, { "content-type": "text/plain; charset=utf-8" });
    input.response.end("Invalid or missing share token.");
    return;
  }
  if (Date.now() > input.expiresAtMs) {
    input.response.writeHead(410, { "content-type": "text/plain; charset=utf-8" });
    input.response.end("Share token expired.");
    return;
  }

  incomingUrl.searchParams.delete(input.tokenParam);
  const target = new URL(input.targetUrl.toString());
  target.pathname = incomingUrl.pathname;
  target.search = incomingUrl.search;
  const headers = new Headers();
  for (const [key, value] of Object.entries(input.request.headers)) {
    if (key.toLowerCase() === "host" || value === undefined) continue;
    if (Array.isArray(value)) {
      for (const entry of value) headers.append(key, entry);
    } else {
      headers.set(key, value);
    }
  }
  const body = input.request.method === "GET" || input.request.method === "HEAD"
    ? undefined
    : input.request as unknown as BodyInit;
  try {
    const upstream = await fetch(target, {
      method: input.request.method,
      headers,
      body,
      redirect: "manual",
      duplex: body ? "half" : undefined,
    } as RequestInit & { duplex?: "half" });
    input.response.statusCode = upstream.status;
    upstream.headers.forEach((value, key) => {
      if (key.toLowerCase() !== "content-encoding") input.response.setHeader(key, value);
    });
    if (!upstream.body) {
      input.response.end();
      return;
    }
    const reader = upstream.body.getReader();
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      input.response.write(Buffer.from(chunk.value));
    }
    input.response.end();
  } catch (error) {
    input.response.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
    input.response.end(error instanceof Error ? error.message : "Preview proxy failed.");
  }
}

export async function runLanPreviewShare(input: {
  targetUrl: URL;
  flags: Record<string, string>;
  stdout: NodeJS.WritableStream;
  wantsJson: boolean;
  dryRun: boolean;
}): Promise<number> {
  const ttlMs = resolvePreviewShareTtlMs(input.flags);
  const listenPort = parseCanonicalDecimalPort(input.flags["share-port"] ?? input.flags["listen-port"] ?? "0");
  if (listenPort === null) {
    throw new CliHandledError("usage_error", "--share-port/--listen-port must be a canonical decimal TCP port.", CLI_EXIT_USAGE);
  }

  const serverReachable = await probeHttpServer(input.targetUrl);
  if (!serverReachable) {
    throw new CliHandledError("target_unreachable", `No local preview responded at ${input.targetUrl.toString()}`);
  }
  const expiresAt = new Date(Date.now() + ttlMs);
  const token = input.flags.token || randomBytes(18).toString("base64url");
  const listenHost = input.flags.host || "0.0.0.0";
  if (input.dryRun) {
    const payload = buildLanPreviewSharePayload({ targetUrl: input.targetUrl, flags: input.flags, token, expiresAt, actualPort: listenPort || Number(input.targetUrl.port || "80") });
    if (input.wantsJson) writePreviewShareJson(input.stdout, payload);
    else input.stdout.write(`${payload.shareUrl}\n`);
    return CLI_EXIT_OK;
  }

  const tokenParam = input.flags["token-param"] || "claw_share_token";
  const expiresAtMs = expiresAt.getTime();
  const server = http.createServer((request, response) => {
    void pipePreviewProxyResponse({
      targetUrl: input.targetUrl,
      request,
      response,
      token,
      tokenParam,
      expiresAtMs,
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(listenPort, listenHost, () => resolve());
  });
  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : listenPort;
  const payload = buildLanPreviewSharePayload({ targetUrl: input.targetUrl, flags: input.flags, token, expiresAt, actualPort });
  if (input.wantsJson) writePreviewShareJsonLine(input.stdout, payload);
  else input.stdout.write(`${payload.shareUrl}\n`);

  await new Promise<void>((resolve) => {
    const shutdown = () => {
      server.close(() => resolve());
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
    setTimeout(shutdown, ttlMs).unref();
  });
  return CLI_EXIT_OK;
}

export function runTailscalePreviewShare(input: {
  targetUrl: URL;
  flags: Record<string, string>;
  stdout: NodeJS.WritableStream;
  wantsJson: boolean;
  dryRun: boolean;
}): number {
  const token = input.flags.token || randomBytes(18).toString("base64url");
  const tokenParam = input.flags["token-param"] || "claw_share_token";
  const expiresAt = new Date(Date.now() + resolvePreviewShareTtlMs(input.flags));
  const tailscaleBin = input.flags["tailscale-bin"] || findExecutable("tailscale");
  const port = input.targetUrl.port || (input.targetUrl.protocol === "https:" ? "443" : "80");
  const command = [tailscaleBin || "tailscale", "serve", "--bg", port];
  const baseShareUrl = input.flags["share-url"] || `https://tailnet-device.invalid/${input.targetUrl.pathname.replace(/^\//, "")}`;
  const payload: PreviewSharePayload = {
    ok: true,
    mode: "tailscale",
    targetUrl: input.targetUrl.toString(),
    shareUrl: appendQueryParam(baseShareUrl, tokenParam, token),
    token,
    tokenParam,
    expiresAt: expiresAt.toISOString(),
    qrPayload: appendQueryParam(baseShareUrl, tokenParam, token),
    provider: {
      available: Boolean(tailscaleBin),
      command,
      ...(!tailscaleBin ? { message: "tailscale is not installed or not on PATH." } : {}),
    },
  };
  if (!input.dryRun && tailscaleBin) {
    const result = spawnSync(tailscaleBin, ["serve", "--bg", port], { encoding: "utf8" });
    if (result.status !== 0) {
      throw new CliHandledError("provider_failed", result.stderr.trim() || "tailscale serve failed.");
    }
  }
  if (input.wantsJson) writePreviewShareJson(input.stdout, payload);
  else input.stdout.write(`${payload.shareUrl}\n`);
  return CLI_EXIT_OK;
}

export async function runCloudflarePreviewShare(input: {
  targetUrl: URL;
  flags: Record<string, string>;
  stdout: NodeJS.WritableStream;
  wantsJson: boolean;
  dryRun: boolean;
}): Promise<number> {
  const token = input.flags.token || randomBytes(18).toString("base64url");
  const tokenParam = input.flags["token-param"] || "claw_share_token";
  const expiresAt = new Date(Date.now() + resolvePreviewShareTtlMs(input.flags));
  const mockUrl = process.env.CLAW_PREVIEW_CLOUDFLARE_URL || input.flags["share-url"];
  const cloudflaredBin = input.flags["cloudflared-bin"] || findExecutable("cloudflared");
  const providerCommand = [cloudflaredBin || "cloudflared", "tunnel", "--url", input.targetUrl.toString()];
  if (input.dryRun || mockUrl) {
    const shareUrl = appendQueryParam(mockUrl || "https://trycloudflare-preview.invalid/", tokenParam, token);
    const payload: PreviewSharePayload = {
      ok: true,
      mode: "cloudflare",
      targetUrl: input.targetUrl.toString(),
      shareUrl,
      token,
      tokenParam,
      expiresAt: expiresAt.toISOString(),
      qrPayload: shareUrl,
      provider: {
        available: Boolean(cloudflaredBin || mockUrl),
        command: providerCommand,
        ...(!cloudflaredBin && !mockUrl ? { message: "cloudflared is not installed or not on PATH." } : {}),
      },
    };
    if (input.wantsJson) writePreviewShareJson(input.stdout, payload);
    else input.stdout.write(`${payload.shareUrl}\n`);
    return CLI_EXIT_OK;
  }
  if (!cloudflaredBin) {
    throw new CliHandledError("provider_unavailable", "cloudflared is not installed or not on PATH.");
  }
  const child = spawn(cloudflaredBin, ["tunnel", "--url", input.targetUrl.toString()], {
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });
  let announced = false;
  const announce = (chunk: Buffer) => {
    const text = chunk.toString("utf8");
    const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
    if (!match || announced) return;
    announced = true;
    const shareUrl = appendQueryParam(match[0], tokenParam, token);
    const payload: PreviewSharePayload = {
      ok: true,
      mode: "cloudflare",
      targetUrl: input.targetUrl.toString(),
      shareUrl,
      token,
      tokenParam,
      expiresAt: expiresAt.toISOString(),
      qrPayload: shareUrl,
      provider: { available: true, command: providerCommand },
    };
    if (input.wantsJson) writePreviewShareJsonLine(input.stdout, payload);
    else input.stdout.write(`${payload.shareUrl}\n`);
  };
  child.stdout?.on("data", announce);
  child.stderr?.on("data", announce);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      if (!announced) {
        child.kill("SIGTERM");
        reject(new CliHandledError("provider_failed", "cloudflared did not announce a public URL."));
      }
    }, 15_000);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    setTimeout(() => {
      child.kill("SIGTERM");
    }, resolvePreviewShareTtlMs(input.flags)).unref();
  });
  return announced ? CLI_EXIT_OK : CLI_EXIT_FAILURE;
}
