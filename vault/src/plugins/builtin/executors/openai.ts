// OpenAI image generation executor. Includes an in-memory hourly quota
// counter to prevent runaway spend. Quota is keyed by secretId and the
// optional `quotaTag` argument so multiple tags share or split budgets.

import type { ExecutorPlugin, ExecutorOutput } from "../../types.ts";
import { redactString } from "../../redaction.ts";

interface OpenAiImageArgs {
  prompt: string;
  size?: string; // "1024x1024" etc.
  model?: string;
  n?: number;
  quotaTag?: string;
  hourlyQuota?: number; // default 30
  apiKeyField?: string;
}

interface QuotaBucket {
  windowStartMs: number;
  count: number;
}

const buckets = new Map<string, QuotaBucket>();
const HOUR_MS = 60 * 60 * 1000;

function quotaKey(secretId: string, tag: string): string {
  return `${secretId}|${tag}`;
}

function consumeQuota(secretId: string, tag: string, n: number, limit: number): { ok: boolean; reason?: string } {
  const key = quotaKey(secretId, tag);
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStartMs > HOUR_MS) {
    bucket = { windowStartMs: now, count: 0 };
    buckets.set(key, bucket);
  }
  if (bucket.count + n > limit) {
    return { ok: false, reason: `hourly quota of ${limit} exceeded for ${tag}` };
  }
  bucket.count += n;
  return { ok: true };
}

export const openaiImageExecutor: ExecutorPlugin = {
  id: "openai.image_generate",
  label: "OpenAI image generate",
  description: "Generate images via OpenAI with an hourly quota guard.",
  capabilities: ["broker.http"],
  async execute(ctx): Promise<ExecutorOutput> {
    const args = ctx.args as OpenAiImageArgs;
    const apiKeyField = args.apiKeyField ?? "api_key";
    const apiKey = ctx.resolvedFields[apiKeyField];
    if (!apiKey) return { ok: false, detail: `Missing field ${apiKeyField}` };
    if (!args.prompt) return { ok: false, detail: "prompt required" };

    const tag = args.quotaTag ?? "default";
    const limit = args.hourlyQuota ?? 30;
    const n = args.n ?? 1;
    const quota = consumeQuota(ctx.secret.id, tag, n, limit);
    if (!quota.ok) return { ok: false, detail: quota.reason ?? "quota exceeded" };

    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: args.prompt,
        size: args.size ?? "1024x1024",
        model: args.model ?? "gpt-image-1",
        n,
      }),
      signal: ctx.abortSignal,
    });
    const text = await res.text();
    return {
      ok: res.ok,
      status: res.status,
      body: redactString(text, [apiKey]),
    };
  },
};
