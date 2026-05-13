import fs from "node:fs";
import path from "node:path";

import type { CliContext } from "../parser.ts";
import { out } from "../parser.ts";
import { loadConfig } from "../../server/config.ts";

export async function workspaces(ctx: CliContext): Promise<number> {
  const [, command] = ctx.args.positional;
  if (!command || command === "list") {
    out(ctx, await ctx.client.get("/v1/workspaces"));
    return 0;
  }
  if (command === "create") {
    const name = ctx.args.flags.name;
    if (!name) { ctx.host.stderr.write("--name required\n"); return 64; }
    out(ctx, await ctx.client.post("/v1/workspaces", { name, slug: ctx.args.flags.slug, default_timezone: ctx.args.flags.tz, default_locale: ctx.args.flags.locale }));
    return 0;
  }
  if (command === "use") {
    const id = ctx.args.positional[2];
    if (!id) { ctx.host.stderr.write("workspace id required\n"); return 64; }
    const config = loadConfig();
    const ctxFile = path.join(path.dirname(config.tokenStorePath), "current-workspace");
    fs.mkdirSync(path.dirname(ctxFile), { recursive: true });
    fs.writeFileSync(ctxFile, id, "utf8");
    out(ctx, { ok: true, workspace_id: id });
    return 0;
  }
  if (command === "get") {
    const id = ctx.args.positional[2];
    out(ctx, await ctx.client.get(`/v1/workspaces/${id}`));
    return 0;
  }
  ctx.host.stderr.write(`unknown workspaces command: ${command}\n`);
  return 64;
}

export async function token(ctx: CliContext): Promise<number> {
  const [, command] = ctx.args.positional;
  const ws = currentWorkspaceId(ctx);
  if (command === "create") {
    out(ctx, await ctx.client.post(`/v1/workspaces/${ws}/tokens`, { name: ctx.args.flags.name ?? "cli", scopes: (ctx.args.flags.scope ?? "").split(",").filter(Boolean) }));
    return 0;
  }
  if (command === "list") {
    out(ctx, await ctx.client.get(`/v1/workspaces/${ws}/tokens`));
    return 0;
  }
  if (command === "revoke") {
    const id = ctx.args.positional[2];
    out(ctx, await ctx.client.delete(`/v1/workspaces/${ws}/tokens/${id}`));
    return 0;
  }
  ctx.host.stderr.write(`unknown token command: ${command}\n`);
  return 64;
}

export function currentWorkspaceId(ctx: CliContext): string {
  if (ctx.args.flags.workspace) return ctx.args.flags.workspace;
  if (process.env.CLAW_PUBLISHING_WORKSPACE) return process.env.CLAW_PUBLISHING_WORKSPACE;
  const config = loadConfig();
  const ctxFile = path.join(path.dirname(config.tokenStorePath), "current-workspace");
  try { return fs.readFileSync(ctxFile, "utf8").trim(); } catch { /* fall through */ }
  throw new Error("no workspace selected. Use `publishing workspaces use <id>` or pass --workspace <id>.");
}
