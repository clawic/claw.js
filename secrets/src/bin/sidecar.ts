import { spawn } from "node:child_process";
import { clawApiPath } from "@clawjs/core";

type JsonRecord = Record<string, unknown>;

const baseUrl = (process.env.CLAW_SECRETS_BASE_URL ?? "http://127.0.0.1:24103").replace(/\/$/, "");
const token = process.env.CLAW_SECRETS_TOKEN ?? "";
const tenantId = process.env.CLAW_SECRETS_TENANT_ID ?? "clawix-local";

function argValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function argValues(args: string[], name: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === name && args[index + 1]) values.push(args[index + 1]!);
  }
  return values;
}

async function api(path: string, init: RequestInit = {}): Promise<JsonRecord> {
  const response = await fetch(`${baseUrl}${clawApiPath(path)}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) as JsonRecord : {};
  if (!response.ok) {
    throw new Error(typeof payload.error === "string" ? payload.error : `Secrets request failed: ${response.status}`);
  }
  return payload;
}

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function discoverDeclaredFields(input: { url?: string; body?: string; headers?: Record<string, string> }) {
  const declared = new Map<string, { secretName: string; fieldName: string; placement: string }>();
  const template = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;
  const add = (text: string | undefined, placement: string) => {
    if (!text) return;
    for (const match of text.matchAll(template)) {
      const ref = match[1] ?? "";
      const separator = ref.lastIndexOf(".");
      if (separator <= 0) continue;
      const secretName = ref.slice(0, separator);
      const fieldName = ref.slice(separator + 1);
      declared.set(`${secretName}.${fieldName}:${placement}`, { secretName, fieldName, placement });
    }
  };
  add(input.url, "query");
  add(input.body, "body");
  for (const value of Object.values(input.headers ?? {})) add(value, "header");
  return [...declared.values()];
}

async function issueLease(secretName: string, mode: "process" | "browser"): Promise<string> {
  const payload = await api(`tenants/${tenantId}/leases`, {
    method: "POST",
    body: JSON.stringify({
      secretName,
      mode,
      durationMinutes: 5,
      agent: "secrets-sidecar",
      approvalSatisfied: true,
      vpnSatisfied: true,
    }),
  }) as { token?: string };
  if (!payload.token) throw new Error("Lease token missing");
  return payload.token;
}

async function consumeLease(secretName: string, mode: "process" | "browser"): Promise<string> {
  const leaseToken = await issueLease(secretName, mode);
  const payload = await api(`tenants/${tenantId}/leases/consume`, {
    method: "POST",
    body: JSON.stringify({ token: leaseToken, mode }),
  }) as { values?: Record<string, string> };
  const value = Object.values(payload.values ?? {})[0];
  if (!value) throw new Error(`No secret value available for ${secretName}`);
  return value;
}

async function main(): Promise<void> {
  if (!token) throw new Error("CLAW_SECRETS_TOKEN is required");
  const [command, ...args] = process.argv.slice(2);
  if (command === "list-secrets") {
    const payload = await api(`tenants/${tenantId}/secrets`) as { secrets?: Array<{ internalName: string }> };
    printJson((payload.secrets ?? []).map((secret) => ({ name: secret.internalName })));
    return;
  }
  if (command === "describe-secret") {
    const name = argValue(args, "--name");
    if (!name) throw new Error("--name is required");
    const payload = await api(`tenants/${tenantId}/secrets/${encodeURIComponent(name)}`) as { secret?: { internalName: string } };
    printJson(payload.secret ? [{ name: payload.secret.internalName }] : []);
    return;
  }
  if (command === "request") {
    const method = argValue(args, "--method") ?? "GET";
    const url = argValue(args, "--url");
    if (!url) throw new Error("--url is required");
    const headers = Object.fromEntries(argValues(args, "--header").map((header) => {
      const separator = header.indexOf(":");
      return separator >= 0
        ? [header.slice(0, separator).trim(), header.slice(separator + 1).trim()]
        : [header, ""];
    }));
    const payload = await api(`tenants/${tenantId}/broker/http`, {
      method: "POST",
      body: JSON.stringify({
        method,
        url,
        headers,
        capability: "broker.http",
        riskTier: "read",
        agent: "secrets-sidecar",
        declaredFields: discoverDeclaredFields({ url, headers }),
        approvalSatisfied: true,
        vpnSatisfied: true,
      }),
    }) as { bodyText?: string };
    process.stdout.write(payload.bodyText ?? "");
    return;
  }
  if (command === "spawn-process") {
    const secretName = argValue(args, "--secret-name");
    const childCommand = argValue(args, "--command");
    if (!secretName || !childCommand) throw new Error("--secret-name and --command are required");
    const secretValue = await consumeLease(secretName, "process");
    const childArgs = argValues(args, "--arg");
    await new Promise<void>((resolve, reject) => {
      const child = spawn(childCommand, childArgs, { stdio: ["pipe", "pipe", "pipe"] });
      child.stdout.pipe(process.stdout);
      child.stderr.pipe(process.stderr);
      child.once("error", reject);
      child.once("close", (code) => code === 0 ? resolve() : reject(new Error(`Process exited with ${code}`)));
      child.stdin.end(secretValue);
    });
    return;
  }
  if (command === "browser-fill") {
    const secretName = argValue(args, "--secret-name");
    const url = argValue(args, "--url");
    const secretSelector = argValue(args, "--secret-selector");
    if (!secretName || !url || !secretSelector) throw new Error("--secret-name, --url and --secret-selector are required");
    const secretValue = await consumeLease(secretName, "browser");
    const { chromium } = await import("playwright");
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.goto(url);
      for (const field of argValues(args, "--field")) {
        const separator = field.indexOf("::");
        if (separator > 0) await page.fill(field.slice(0, separator), field.slice(separator + 2));
      }
      await page.fill(secretSelector, secretValue);
      const submitSelector = argValue(args, "--submit-selector");
      if (submitSelector) await Promise.all([
        page.waitForLoadState("networkidle").catch(() => undefined),
        page.click(submitSelector),
      ]);
      const screenshot = argValue(args, "--screenshot");
      if (screenshot) await page.screenshot({ path: screenshot, fullPage: true });
    } finally {
      await browser.close();
    }
    return;
  }
  throw new Error(`Unknown command: ${command ?? ""}`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
