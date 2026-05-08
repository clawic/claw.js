// Generic brokered HTTP. The vault server executes the request with the
// secret resolved server-side; the caller never sees the value. Supports
// `{{secret.field_name}}` templates in url/headers/body.

import type { ExecutorPlugin } from "../../types.ts";
import { redactHeaders, redactString } from "../../redaction.ts";

const TEMPLATE = /\{\{\s*secret\.([a-zA-Z0-9_]+)\s*\}\}/g;

function resolveTemplate(input: string | undefined, fields: Record<string, string>): string | undefined {
  if (input === undefined) return undefined;
  return input.replace(TEMPLATE, (_match, name) => fields[name] ?? "");
}

export const brokerHttpExecutor: ExecutorPlugin = {
  id: "broker.http",
  label: "Brokered HTTP",
  description: "Run an HTTP request server-side with secrets injected and redacted from the response.",
  capabilities: ["broker.http"],
  validate(ctx) {
    const args = ctx.args as { method?: string; url?: string };
    if (typeof args.method !== "string") return { ok: false, reason: "args.method is required" };
    if (typeof args.url !== "string") return { ok: false, reason: "args.url is required" };
    return { ok: true };
  },
  async execute(ctx) {
    const args = ctx.args as {
      method: string;
      url: string;
      headers?: Record<string, string>;
      body?: string;
      timeoutMs?: number;
    };
    const url = resolveTemplate(args.url, ctx.resolvedFields)!;
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(args.headers ?? {})) {
      headers[k] = resolveTemplate(v, ctx.resolvedFields)!;
    }
    const body = resolveTemplate(args.body, ctx.resolvedFields);
    const timeoutMs = args.timeoutMs ?? 30_000;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: args.method,
        headers,
        body,
        signal: ctx.abortSignal ?? controller.signal,
      });
      const respHeaders: Record<string, string> = {};
      res.headers.forEach((value, key) => {
        respHeaders[key] = value;
      });
      const text = await res.text();
      return {
        ok: res.ok,
        status: res.status,
        headers: respHeaders,
        body: text,
      };
    } finally {
      clearTimeout(timer);
    }
  },
  redact(output, secrets) {
    const values = Object.values(secrets);
    return {
      ...output,
      body: output.body ? redactString(output.body, values) : output.body,
      headers: output.headers ? redactHeaders(output.headers, values) : output.headers,
    };
  },
};
