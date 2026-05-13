import type { CliContext } from "../parser.ts";
import { out, readFileFlag } from "../parser.ts";
import { currentWorkspaceId } from "./workspaces.ts";

export async function posts(ctx: CliContext): Promise<number> {
  const ws = currentWorkspaceId(ctx);
  const [, command, idOrSub, idMaybe] = ctx.args.positional;
  if (!command || command === "list") {
    const params: string[] = [];
    if (ctx.args.flags.status) params.push(`status=${ctx.args.flags.status}`);
    if (ctx.args.flags.from) params.push(`from=${encodeURIComponent(ctx.args.flags.from)}`);
    if (ctx.args.flags.to) params.push(`to=${encodeURIComponent(ctx.args.flags.to)}`);
    out(ctx, await ctx.client.get(`/v1/workspaces/${ws}/posts${params.length ? `?${params.join("&")}` : ""}`));
    return 0;
  }
  if (command === "create") {
    const file = readFileFlag(ctx, "file") as Record<string, unknown> | null;
    if (file) {
      out(ctx, await ctx.client.post(`/v1/workspaces/${ws}/posts`, file));
      return 0;
    }
    const body = ctx.args.flags.body;
    const account = ctx.args.flags.account;
    if (!body || !account) { ctx.host.stderr.write("--file FILE  OR  --body BODY --account CA_ID  required\n"); return 64; }
    out(ctx, await ctx.client.post(`/v1/workspaces/${ws}/posts`, {
      accounts: [account],
      editorial_status: ctx.args.flags.editorial ?? "ready",
      variants: [{ is_original: true, blocks: [{ body }] }],
      ...(ctx.args.flags.at ? { schedule: { kind: "datetime", at: ctx.args.flags.at, timezone: ctx.args.flags.tz } } : {}),
    }));
    return 0;
  }
  if (command === "get") {
    const id = idOrSub;
    if (!id) { ctx.host.stderr.write("post id required\n"); return 64; }
    out(ctx, await ctx.client.get(`/v1/workspaces/${ws}/posts/${id}`));
    return 0;
  }
  if (command === "update") {
    const id = idOrSub;
    if (!id) { ctx.host.stderr.write("post id required\n"); return 64; }
    const file = readFileFlag(ctx, "file");
    out(ctx, await ctx.client.patch(`/v1/workspaces/${ws}/posts/${id}`, file ?? {}));
    return 0;
  }
  if (command === "delete") {
    const id = idOrSub;
    out(ctx, await ctx.client.delete(`/v1/workspaces/${ws}/posts/${id}`));
    return 0;
  }
  if (command === "duplicate") {
    out(ctx, await ctx.client.post(`/v1/workspaces/${ws}/posts/${idOrSub}/duplicate`));
    return 0;
  }
  if (command === "schedule") {
    const at = ctx.args.flags.at;
    const tz = ctx.args.flags.tz;
    out(ctx, await ctx.client.post(`/v1/workspaces/${ws}/posts/${idOrSub}/schedule`, { at, tz }));
    return 0;
  }
  if (command === "schedule-now") {
    out(ctx, await ctx.client.post(`/v1/workspaces/${ws}/posts/${idOrSub}/schedule`, { now: true }));
    return 0;
  }
  if (command === "unschedule") {
    out(ctx, await ctx.client.post(`/v1/workspaces/${ws}/posts/${idOrSub}/unschedule`));
    return 0;
  }
  if (command === "cancel") {
    out(ctx, await ctx.client.post(`/v1/workspaces/${ws}/posts/${idOrSub}/cancel`));
    return 0;
  }
  if (command === "retry") {
    out(ctx, await ctx.client.post(`/v1/workspaces/${ws}/posts/${idOrSub}/retry`, { account: ctx.args.flags.account }));
    return 0;
  }
  if (command === "approve") {
    const stage = ctx.args.flags.stage;
    const decision = ctx.args.flags.decision ?? "approve";
    out(ctx, await ctx.client.post(`/v1/workspaces/${ws}/approvals/${idOrSub}/decisions`, { stage_index: Number(stage ?? "0"), reviewer_user_id: ctx.args.flags.user ?? "cli", decision, comment: ctx.args.flags.comment }));
    return 0;
  }
  if (command === "variants" && idOrSub === "set") {
    const postId = idMaybe;
    if (!postId) { ctx.host.stderr.write("post id required\n"); return 64; }
    const file = readFileFlag(ctx, "file") as Record<string, unknown> | null;
    if (!file) { ctx.host.stderr.write("--file required\n"); return 64; }
    out(ctx, await ctx.client.put(`/v1/workspaces/${ws}/posts/${postId}/variants`, { channel_account_id: ctx.args.flags.account ?? null, variant: file }));
    return 0;
  }
  ctx.host.stderr.write(`unknown posts command: ${command}\n`);
  return 64;
}
