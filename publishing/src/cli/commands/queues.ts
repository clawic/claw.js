import type { CliContext } from "../parser.ts";
import { out } from "../parser.ts";
import { currentWorkspaceId } from "./workspaces.ts";

const DAY_MAP: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

export async function queues(ctx: CliContext): Promise<number> {
  const ws = currentWorkspaceId(ctx);
  const [, command, sub, idMaybe] = ctx.args.positional;
  if (!command || command === "list") {
    out(ctx, await ctx.client.get(`/v1/workspaces/${ws}/queues`));
    return 0;
  }
  if (command === "create") {
    out(ctx, await ctx.client.post(`/v1/workspaces/${ws}/queues`, {
      name: ctx.args.flags.name ?? "queue",
      default_timezone: ctx.args.flags.tz,
    }));
    return 0;
  }
  if (command === "pause") {
    out(ctx, await ctx.client.post(`/v1/workspaces/${ws}/queues/${sub}/pause`));
    return 0;
  }
  if (command === "resume") {
    out(ctx, await ctx.client.post(`/v1/workspaces/${ws}/queues/${sub}/resume`));
    return 0;
  }
  if (command === "slots" && sub === "add") {
    const queueId = ctx.args.flags.queue;
    const day = (ctx.args.flags.day ?? "mon").toLowerCase();
    const time = ctx.args.flags.time ?? "09:00";
    if (!queueId) { ctx.host.stderr.write("--queue required\n"); return 64; }
    out(ctx, await ctx.client.post(`/v1/workspaces/${ws}/queues/${queueId}/slots`, {
      day_of_week: DAY_MAP[day] ?? Number(day),
      time_of_day: time,
    }));
    return 0;
  }
  if (command === "attach") {
    const queueId = ctx.args.flags.queue;
    const account = ctx.args.flags.account;
    if (!queueId || !account) { ctx.host.stderr.write("--queue and --account required\n"); return 64; }
    out(ctx, await ctx.client.post(`/v1/workspaces/${ws}/queues/${queueId}/accounts`, { channel_account_id: account }));
    return 0;
  }
  if (command === "enqueue") {
    const queueId = ctx.args.flags.queue;
    const postId = sub;
    if (!queueId || !postId) { ctx.host.stderr.write("--queue and post id required\n"); return 64; }
    out(ctx, await ctx.client.post(`/v1/workspaces/${ws}/queues/${queueId}/entries`, { post_id: postId }));
    return 0;
  }
  ctx.host.stderr.write(`unknown queues command: ${command}\n`);
  return 64;
}

export async function calendar(ctx: CliContext): Promise<number> {
  const ws = currentWorkspaceId(ctx);
  const [, view] = ctx.args.positional;
  const date = ctx.args.flags.date ?? new Date().toISOString().slice(0, 7);
  const fromDate = view === "week" ? `${date}T00:00:00Z` : `${date}-01T00:00:00Z`;
  const toDate = view === "week"
    ? new Date(new Date(date).getTime() + 7 * 86400_000).toISOString()
    : new Date(new Date(`${date}-01`).setUTCMonth(new Date(`${date}-01`).getUTCMonth() + 1)).toISOString();
  out(ctx, await ctx.client.get(`/v1/workspaces/${ws}/posts?from=${encodeURIComponent(fromDate)}&to=${encodeURIComponent(toDate)}`));
  return 0;
}

export async function blackouts(ctx: CliContext): Promise<number> {
  const ws = currentWorkspaceId(ctx);
  const [, command] = ctx.args.positional;
  if (command === "add") {
    out(ctx, await ctx.client.post(`/v1/workspaces/${ws}/blackouts`, {
      starts_at: ctx.args.flags.from,
      ends_at: ctx.args.flags.to,
      channel_account_id: ctx.args.flags.account ?? null,
      reason: ctx.args.flags.reason,
    }));
    return 0;
  }
  ctx.host.stderr.write(`unknown blackouts command: ${command}\n`);
  return 64;
}
