import type { CliContext } from "../parser.ts";
import { out } from "../parser.ts";
import { currentWorkspaceId } from "./workspaces.ts";

export async function families(ctx: CliContext): Promise<number> {
  const [, command, id] = ctx.args.positional;
  if (!command || command === "list") {
    out(ctx, await ctx.client.get("/v1/families"));
    return 0;
  }
  if (command === "capabilities") {
    if (!id) { ctx.host.stderr.write("family id required\n"); return 64; }
    out(ctx, await ctx.client.get(`/v1/families/${id}`));
    return 0;
  }
  ctx.host.stderr.write(`unknown families command: ${command}\n`);
  return 64;
}

export async function channels(ctx: CliContext): Promise<number> {
  const ws = currentWorkspaceId(ctx);
  const [, command, id] = ctx.args.positional;
  if (!command || command === "list") {
    out(ctx, await ctx.client.get(`/v1/ws/${ws}/channels`));
    return 0;
  }
  if (command === "add") {
    const family = ctx.args.flags.family;
    if (!family) { ctx.host.stderr.write("--family required\n"); return 64; }
    const url = ctx.args.flags.url ? `/v1/ws/${ws}/channels` : `/v1/ws/${ws}/channels`;
    // Pass through to the framework directly with a raw account record. For
    // OAuth flows the user should use `publishing channels connect --family ...`.
    out(ctx, await ctx.client.post(url, {
      family_id: family,
      provider_account_id: ctx.args.flags["provider-id"] ?? `manual_${Date.now()}`,
      display_name: ctx.args.flags.name ?? family,
      handle: ctx.args.flags.handle ?? null,
    }));
    return 0;
  }
  if (command === "connect") {
    const family = ctx.args.flags.family;
    if (!family) { ctx.host.stderr.write("--family required\n"); return 64; }
    const body: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(ctx.args.flags)) {
      if (k === "family" || k === "url" || k === "token" || k === "workspace") continue;
      body[k.replace(/-/g, "_")] = v;
    }
    out(ctx, await ctx.client.post(`/v1/ws/${ws}/channels/connect/${family}`, body));
    return 0;
  }
  if (command === "probe") {
    if (!id) { ctx.host.stderr.write("account id required\n"); return 64; }
    out(ctx, await ctx.client.post(`/v1/ws/${ws}/channels/${id}/probe`));
    return 0;
  }
  if (command === "remove") {
    if (!id) { ctx.host.stderr.write("account id required\n"); return 64; }
    out(ctx, await ctx.client.delete(`/v1/ws/${ws}/channels/${id}`));
    return 0;
  }
  ctx.host.stderr.write(`unknown channels command: ${command}\n`);
  return 64;
}
