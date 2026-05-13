import type { CliContext } from "../parser.ts";
import { out } from "../parser.ts";
import { currentWorkspaceId } from "./workspaces.ts";

export async function webhooks(ctx: CliContext): Promise<number> {
  const ws = currentWorkspaceId(ctx);
  const [, command, id] = ctx.args.positional;
  if (!command || command === "list") {
    out(ctx, await ctx.client.get(`/v1/workspaces/${ws}/webhooks`));
    return 0;
  }
  if (command === "create") {
    out(ctx, await ctx.client.post(`/v1/workspaces/${ws}/webhooks`, {
      name: ctx.args.flags.name ?? "webhook",
      callback_url: ctx.args.flags.url,
      events: (ctx.args.flags.events ?? "post.published,post.failed").split(",").map((s) => s.trim()),
      max_attempts: ctx.args.flags.attempts ? Number(ctx.args.flags.attempts) : undefined,
    }));
    return 0;
  }
  if (command === "deliveries") {
    if (!id) { ctx.host.stderr.write("webhook id required\n"); return 64; }
    out(ctx, await ctx.client.get(`/v1/workspaces/${ws}/webhooks/${id}/deliveries`));
    return 0;
  }
  if (command === "replay") {
    if (!id) { ctx.host.stderr.write("webhook id required\n"); return 64; }
    out(ctx, await ctx.client.post(`/v1/workspaces/${ws}/webhooks/${id}/replay`, { delivery_id: ctx.args.flags.delivery }));
    return 0;
  }
  ctx.host.stderr.write(`unknown webhooks command: ${command}\n`);
  return 64;
}
