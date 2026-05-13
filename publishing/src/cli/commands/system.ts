import fs from "node:fs";
import path from "node:path";

import type { CliContext } from "../parser.ts";
import { out } from "../parser.ts";
import { loadConfig } from "../../server/config.ts";

export async function login(ctx: CliContext): Promise<number> {
  const config = loadConfig();
  if (ctx.args.flags.token) {
    fs.mkdirSync(path.dirname(config.tokenStorePath), { recursive: true });
    fs.writeFileSync(config.tokenStorePath, ctx.args.flags.token, { mode: 0o600 });
    out(ctx, { ok: true, stored_at: config.tokenStorePath });
    return 0;
  }
  out(ctx, { admin_token_path: config.tokenStorePath, base_url: ctx.args.flags.url ?? "http://127.0.0.1:4640" });
  return 0;
}

export async function doctor(ctx: CliContext): Promise<number> {
  const status = await ctx.client.get("/v1/system/status");
  out(ctx, status);
  return 0;
}

export async function logs(ctx: CliContext): Promise<number> {
  const [, command] = ctx.args.positional;
  if (command !== "tail") { ctx.host.stderr.write("only `publishing logs tail` is supported\n"); return 64; }
  // Naive realtime via WebSocket would be more involved; for parity with the
  // CLI surface we expose the audit log as a poll.
  const ws = ctx.args.flags.workspace ?? process.env.BADGER_WORKSPACE;
  if (!ws) { ctx.host.stderr.write("--workspace required\n"); return 64; }
  out(ctx, await ctx.client.get(`/v1/ws/${ws}/audit`));
  return 0;
}

export async function db(ctx: CliContext): Promise<number> {
  const [, command] = ctx.args.positional;
  if (command === "backup") {
    const out_ = ctx.args.flags.out ?? "publishing-backup.sqlite";
    fs.copyFileSync(loadConfig().dbPath, out_);
    out(ctx, { ok: true, out: out_ });
    return 0;
  }
  if (command === "restore") {
    const inFile = ctx.args.flags.in;
    if (!inFile) { ctx.host.stderr.write("--in required\n"); return 64; }
    fs.copyFileSync(inFile, loadConfig().dbPath);
    out(ctx, { ok: true, restored_from: inFile });
    return 0;
  }
  ctx.host.stderr.write(`unknown db command: ${command}\n`);
  return 64;
}

export async function importCmd(ctx: CliContext): Promise<number> {
  const [, kind, value] = ctx.args.positional;
  const ws = ctx.args.flags.workspace ?? process.env.BADGER_WORKSPACE;
  if (!ws) { ctx.host.stderr.write("--workspace required\n"); return 64; }
  if (kind === "json") {
    const payload = JSON.parse(fs.readFileSync(value!, "utf8"));
    out(ctx, await ctx.client.post(`/v1/ws/${ws}/imports/json`, payload));
    return 0;
  }
  ctx.host.stderr.write(`unknown import kind: ${kind}\n`);
  return 64;
}

export async function exportCmd(ctx: CliContext): Promise<number> {
  const ws = ctx.args.flags.workspace ?? process.env.BADGER_WORKSPACE;
  if (!ws) { ctx.host.stderr.write("--workspace required\n"); return 64; }
  const out_ = ctx.args.flags.out;
  const dump = {
    workspace: await ctx.client.get(`/v1/workspaces/${ws}`),
    posts: await ctx.client.get(`/v1/ws/${ws}/posts`),
    channels: await ctx.client.get(`/v1/ws/${ws}/channels`),
    queues: await ctx.client.get(`/v1/ws/${ws}/queues`),
    campaigns: await ctx.client.get(`/v1/ws/${ws}/campaigns`),
    templates: await ctx.client.get(`/v1/ws/${ws}/templates`),
    webhooks: await ctx.client.get(`/v1/ws/${ws}/webhooks`),
  };
  if (out_) { fs.writeFileSync(out_, JSON.stringify(dump, null, 2)); out(ctx, { ok: true, out: out_ }); return 0; }
  out(ctx, dump);
  return 0;
}
