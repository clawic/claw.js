import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";

import { chromium } from "@playwright/test";

function parseArgs(argv: string[]): { flags: Map<string, string[]>; positionals: string[] } {
  const flags = new Map<string, string[]>();
  const positionals: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith("--")) {
      positionals.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      flags.set(key, [...(flags.get(key) ?? []), "true"]);
      continue;
    }
    flags.set(key, [...(flags.get(key) ?? []), next]);
    index += 1;
  }
  return { flags, positionals };
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function readFlag(flags: Map<string, string[]>, name: string, fallback = ""): string {
  return flags.get(name)?.[0] ?? fallback;
}

async function api<T>(pathname: string, init: RequestInit = {}): Promise<T> {
  const baseUrl = requireEnv("VAULT_BASE_URL");
  const token = requireEnv("VAULT_TOKEN");
  const response = await fetch(new URL(pathname, baseUrl), {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return await response.json() as T;
}

async function createLease(secretName: string, capability: "lease.process" | "lease.browser", mode: "process" | "browser") {
  const tenantId = requireEnv("VAULT_TENANT_ID");
  return await api<{ lease: { id: string; token: string } }>(`/v1/tenants/${tenantId}/leases`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secretName, capability, mode, ttlSec: 60 }),
  });
}

async function consumeLease(leaseId: string, token: string) {
  const tenantId = requireEnv("VAULT_TENANT_ID");
  return await api<{ secretValue: string }>(`/v1/tenants/${tenantId}/leases/${leaseId}/consume`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
}

async function handleRequest(flags: Map<string, string[]>) {
  const tenantId = requireEnv("VAULT_TENANT_ID");
  const url = readFlag(flags, "url");
  const method = readFlag(flags, "method", "GET");
  const body = readFlag(flags, "body");
  const headers = Object.fromEntries((flags.get("header") ?? []).map((entry) => {
    const [name, ...rest] = entry.split(":");
    return [name.trim(), rest.join(":").trim()];
  }));
  const result = await api<{ status: number; headers: Record<string, string>; bodyText: string }>(`/v1/tenants/${tenantId}/broker/http`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ method, url, headers, ...(body ? { body } : {}) }),
  });
  process.stdout.write(result.bodyText);
}

async function handleList(flags: Map<string, string[]>) {
  const tenantId = requireEnv("VAULT_TENANT_ID");
  const search = readFlag(flags, "search");
  const query = search ? `?search=${encodeURIComponent(search)}` : "";
  const result = await api<{ secrets: Array<Record<string, unknown>> }>(`/v1/tenants/${tenantId}/secrets${query}`);
  process.stdout.write(`${JSON.stringify(result.secrets.map((secret) => ({
    name: secret.secretName,
    kind: secret.kind,
    notes: secret.notes,
    allowedHosts: secret.allowedHosts,
    allowedHeaderNames: secret.allowedHeaderNames,
    readOnly: secret.readOnly,
    allowInURL: secret.allowInURL,
    allowInRequestBody: secret.allowInRequestBody,
    allowInsecureTransport: false,
    allowLocalNetwork: secret.allowLocalNetwork,
    updatedAt: secret.updatedAt,
  })), null, 2)}\n`);
}

async function handleDescribe(flags: Map<string, string[]>) {
  const tenantId = requireEnv("VAULT_TENANT_ID");
  const name = readFlag(flags, "name");
  const result = await api<{ secret: Record<string, unknown> }>(`/v1/tenants/${tenantId}/secrets/${encodeURIComponent(name)}`);
  process.stdout.write(`${JSON.stringify([{
    name: result.secret.secretName,
    kind: result.secret.kind,
    notes: result.secret.notes,
    allowedHosts: result.secret.allowedHosts,
    allowedHeaderNames: result.secret.allowedHeaderNames,
    readOnly: result.secret.readOnly,
    allowInURL: result.secret.allowInURL,
    allowInRequestBody: result.secret.allowInRequestBody,
    allowInsecureTransport: false,
    allowLocalNetwork: result.secret.allowLocalNetwork,
    updatedAt: result.secret.updatedAt,
  }], null, 2)}\n`);
}

async function handleSpawnProcess(flags: Map<string, string[]>) {
  const secretName = readFlag(flags, "secret-name");
  const command = readFlag(flags, "command");
  const args = flags.get("arg") ?? [];
  const delivery = readFlag(flags, "delivery", "stdin");
  const envName = readFlag(flags, "env-name", "VAULT_SECRET");
  const lease = await createLease(secretName, "lease.process", "process");
  const consumed = await consumeLease(lease.lease.id, lease.lease.token);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: delivery === "stdin" ? ["pipe", "pipe", "pipe"] : ["ignore", "pipe", "pipe"],
      env: delivery === "env"
        ? { ...process.env, [envName]: consumed.secretValue }
        : process.env,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    if (delivery === "stdin") {
      child.stdin.write(consumed.secretValue);
      child.stdin.end();
    }
    child.on("error", reject);
    child.on("close", (code) => {
      if (stdout) process.stdout.write(stdout);
      if (stderr) process.stderr.write(stderr);
      if (code && code !== 0) reject(new Error(`Child exited with ${code}`));
      else resolve();
    });
  });
}

async function handleBrowserFill(flags: Map<string, string[]>) {
  const secretName = readFlag(flags, "secret-name");
  const url = readFlag(flags, "url");
  const secretSelector = readFlag(flags, "secret-selector");
  const submitSelector = readFlag(flags, "submit-selector");
  const screenshotPath = readFlag(flags, "screenshot", path.join(process.cwd(), "vault", "artifacts", `browser-${Date.now()}.png`));
  const fields = (flags.get("field") ?? []).map((entry) => {
    const separator = entry.indexOf("::");
    return {
      selector: separator === -1 ? entry : entry.slice(0, separator),
      value: separator === -1 ? "" : entry.slice(separator + 2),
    };
  });
  const lease = await createLease(secretName, "lease.browser", "browser");
  const consumed = await consumeLease(lease.lease.id, lease.lease.token);
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(url);
    for (const field of fields) {
      await page.locator(field.selector).fill(field.value);
    }
    await page.locator(secretSelector).fill(consumed.secretValue);
    if (submitSelector) {
      await page.locator(submitSelector).click();
    }
    await page.screenshot({ path: screenshotPath, fullPage: true });
    process.stdout.write(`${JSON.stringify({ ok: true, screenshotPath })}\n`);
  } finally {
    await browser.close();
  }
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const { flags } = parseArgs(rest);
  if (command === "request") return await handleRequest(flags);
  if (command === "list-secrets") return await handleList(flags);
  if (command === "describe-secret") return await handleDescribe(flags);
  if (command === "doctor-keychain") {
    process.stdout.write(`Vault sidecar healthy on ${os.hostname()}\n`);
    return;
  }
  if (command === "spawn-process") return await handleSpawnProcess(flags);
  if (command === "browser-fill") return await handleBrowserFill(flags);
  throw new Error(`Unsupported command: ${command}`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
